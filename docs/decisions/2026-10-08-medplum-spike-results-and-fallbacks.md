---
status: proposed
date: 2026-10-08
decision-makers: Engineering lead (pending ratification — record name and date here, then set status to accepted)
---

# Medplum 5.1.42 spike results (S1, S1b, S6, S7) and the fallbacks we adopt

## Context and Problem Statement

The [identity ADR](2026-10-03-medplum-as-identity-and-access-platform.md) rests on Medplum behaviours that the P05 plan marked "confirm before use" (decision D-A13). P05h ran them against the local stack (Medplum 5.1.42) with synthetic data. The runnable evidence is `apps/bots/live/*.live.ts`; run it with `pnpm medplum:up && pnpm medplum:seed && pnpm --filter bots test:medplum`. Each assertion pins what the server does, so a Medplum upgrade that changes it fails there. It signs in four times per run and Medplum throttles logins to 5 per window, so wait about a minute between full runs.

Every spike passes or has a fallback below. Two plan assumptions did not hold (S7, and the webhook half of S6) and one new rule appeared (S1, `meta.account`; now `meta.accounts`, see [Review amendments](#review-amendments-2026-10-08)). The one open choice, step-up auth time (decision 2), was decided in issue #49.

## Results

| Spike | Question | Result |
|---|---|---|
| S1 | `_compartment=%facility` bound per membership | **Pass.** A nurse at A reads A's patient; B's patient and note answer 404; searches return only A's. |
| S1 | Front desk and `Composition` | **Pass.** 403 on read and on search (the search fails, it does not come back empty). |
| S1 | Final note cannot be changed | **Pass.** A physician edits a draft (200) and gets 403 on a `final` note (`writeConstraint` on `%before`). |
| S1 | Directory data without a facility tag | **Pass.** `Practitioner` stays readable for nurse and front desk. |
| S1 | Auth time for step-up | **Decided (option C).** See decision 2. |
| S1 | `ClientApplication` token lifetime | **Pass.** `accessTokenLifetime: "15m"` gives a 900 s token. |
| S1b | Two access entries on one membership | **Pass, with rules.** See decision 3. |
| S7 | `/auth/me` carries `access[]` with parameters | **Fails.** See decision 4. |
| S6 | How long a revoked membership or edited policy keeps working at Medplum (gate 5) | **Immediately.** See decision 5. |

## Decision Outcome

1. **Every facility-scoped write names its facility (`meta.account`; amended below to `meta.accounts`, see [Review amendments](#review-amendments-2026-10-08)).** A plain read returns `meta` with only `versionId` and `lastUpdated`, and Medplum checks the criteria against the *new* version, so a read-modify-write that sends the body back as read is refused (403). The Medplum client's reads include the account; plain HTTP reads do not. `@asc/fhir` (P03) builders stamp `meta.account` on every facility-scoped resource, `@asc/api-client` (P04) never writes a body without it, and a test per write path proves it. The same rule stops a facility user creating or moving a resource into another facility (403).
2. **Step-up: forward the signed `id_token` (decided 2026-10-08 by the engineering lead, issue #49, option C).** `auth_time` exists only in the `id_token` (with `login_id`), which Medplum signs (key at `/.well-known/jwks.json`); the access token has `iat` and `login_id`, and the two `login_id`s are equal. The browser never sends a bare `auth_time` (forgeable). Contract:
   - The web app keeps the `id_token` from sign-in in memory (never storage, LM-004) and sends it as `X-ID-Token` **only on step-up requests**, next to `Authorization: Bearer <access token>`. The refresh cookie flow of P05j is unchanged.
   - The API verifies Medplum's signature on the `id_token` (JWKS), `id_token.login_id === access token login_id` (and the same `sub`), and `now - auth_time <= STEP_UP_MAX_AGE_SECONDS` (default 300). The window is measured on `auth_time`, not on the `id_token`'s own `exp`.
   - Any failure (missing, invalid, mismatched, stale) gives the same answer: **HTTP 403 `{ "code": "step_up_required", "message": "..." }`**, generic like every gate response (P05g decision 5). The audit event records which check failed. The client reacts by re-authenticating and retrying.
   - The contract is the stable part. When signing is built (P16/P19 note finalization, e-prescribing), the client's reaction becomes an explicit signing challenge (option E: password and TOTP at the moment of signing); the fresh `id_token` from that sign-in is what is sent, so the API does not change. Whether option E meets 21 CFR Part 11 or DEA EPCS requirements is a compliance question, not asserted here.
   - Not chosen: A (no refresh tokens: logs clinicians out every 15 minutes), B as first written (raw `auth_time`: forgeable), D (full backend-for-frontend: the plan chose a hybrid token handler; revisit only if a security review asks).
   - **Three checks before the step-up middleware is built** (it is a gated follow-up, due before the first sign/attest route): (1) whether a refresh or a fresh sign-in gives an `id_token` with the right `auth_time` (the spike covered only the `openid` scope, which issues no refresh token); (2) whether Medplum's login throttle (5 per window) is per user or per address, because re-authentication at signing will hit it; (3) the `id_token` has no `aud` claim, so binding to `login_id` and `sub` replaces it, to be confirmed by the security review.
3. **Rules for policies on a membership with several entries.**
   - `hiddenFields`: hidden if *any* entry hides the field, in any order. A field hidden for one role is hidden for the user's other roles too. This is the safe direction; templates must not use `hiddenFields` expecting a second role to reveal it.
   - `readonly`: the user can write if *any* matching entry allows it, in any order. Do not add a second entry for the same resource type to "tighten" access.
   - `writeConstraint`: **order-dependent.** It applied when its entry came first and was silently skipped when an entry without it came first. So the signed-note lock is **not** guaranteed for a user who holds two roles on `Composition` at the same facility. Rules: the provisioner (a) never gives one user two entries that cover the same resource type at the same facility, and (b) a unit test over the role registry fails if two role templates that one person may hold together both cover a type that has a `writeConstraint` (to be added with the provisioner; today only `gi-physician` has one). Independently of Medplum, the API routes that edit notes (P16, P19) must refuse an edit to a `final` note at gate 4 and test it, so the lock does not rest on one mechanism. Creating a note directly as `final`, or flipping a draft to `final`, is allowed by the policy (checked); only the signing capability can stop it, so the API signs, never the browser.
   - Each entry keeps its own `%facility`: a user who is `rn` at A and `gi-physician` at B can write a draft at B and gets 403 at A. This is the cross-facility escalation check the plan asked for.
4. **Grants are built from `PractitionerRole`, not from `/auth/me`.** `/auth/me` returns the membership without `access[]` and one merged policy, so a role cannot be paired with its facility. An `AccessPolicy` cannot grant `ProjectMembership` (403: a protected type that needs project admin). Options tried against the server: (a) a project-admin service client reads the membership (works, but holds write power over every membership: **rejected**); (b) parse the resolved criteria (ambiguous with several entries: **rejected**); (c) the provisioner writes one `PractitionerRole` per (role template, facility) next to the membership, from the same assignment, with the template key as `code` and the facility as `organization`, and a narrow read-only client reads those (works, a write attempt gets 403: **adopted** for P05i). The membership stays the source of enforcement: if a `PractitionerRole` ever claims more than the membership, gates 1 to 4 let the request through and Medplum still refuses it at gate 5, so drift fails safe. Confirmed by the engineering lead in #49. P05h's seed writes both from the same role template, and its tests check the membership and the `PractitionerRole` against that template; a live check that compares the two on a running server is still to be written with the provisioner.
5. **Revocation at Medplum is immediate; our cache is the only delay** (the grant cache was removed by [#57](https://github.com/imRahul05/ASC-EHR/issues/57), decided 2026-10-09, so our delay is now Medplum's too; see [Review amendments](#review-amendments-2026-10-08). The 60 s TTL and webhook text below is the original P05h finding, kept as history). Measured on the next request after the change: disabled client membership 3 ms, disabled signed-in user 2 ms, edited `AccessPolicy` 4 ms, changed membership access list 1 ms (all 401 or 403). A token issued to a disabled client is still *issued* but refused when used, so token issuance is not a gate. The worst case for gates 1 to 4 is therefore our identity cache TTL (60 s, P05i). **Not shown:** a Medplum `Subscription` that calls us when a membership changes. On the local stack a subscription on `ProjectMembership` failed the subscription access-policy check (server log: "Access Policy not satisfied"), and a control subscription on `Patient` was not delivered within 10 s even though a container on the Medplum network reaches the host receiver. P05i must not depend on it: it clears the cache from our own admin actions and keeps the 60 s TTL, and the webhook is retried as a separate, measured task before anyone writes that it works. Dropping it for now was confirmed in #49.

### Consequences

- Good: the plan's Medplum assumptions are now tests that run against a real server, not documents.
- Good: two plan errors were found before any route depends on them (S7 and the webhook).
- Bad: the identity adapter needs a second data source (`PractitionerRole`) and a drift test, which the plan did not budget.
- Neutral: step-up needs a middleware that verifies a second token on step-up routes, and three checks before it is built (decision 2).
- Neutral: the live suite is not part of `pnpm test` or CI yet; the policy test joins CI when P01 provides a disposable Medplum.

### Confirmation

- `pnpm --filter bots test:medplum` passes against the local stack.
- The P05h decisions block in the P05 plan repeats decisions 1 to 5 as rules for P03, P04, P05i and P05j.
- Ratified by the engineering lead (name and date in the front matter).

## Review amendments (2026-10-08)

An architecture review of PR #53 and PR #56 kept the direction (per-facility `access[]` entries and facility-tagged resources are Medplum's own multi-tenant pattern; Medplum stays gate 5) and changed or questioned the points below. The items that reversed or extended something confirmed in #49 were decided on 2026-10-09 in [#57](https://github.com/imRahul05/ASC-EHR/issues/57), [#58](https://github.com/imRahul05/ASC-EHR/issues/58) and [#59](https://github.com/imRahul05/ASC-EHR/issues/59) (the recommended options were adopted); [#60](https://github.com/imRahul05/ASC-EHR/issues/60) is still open. The other items tighten a rule and apply now. This ADR stays `proposed` until it is ratified ([#50](https://github.com/imRahul05/ASC-EHR/issues/50)).

**Decision 1 (`meta.account`).**
- In Medplum 5.1.42 `meta.account` is deprecated in favour of `meta.accounts` (a list). Facility-scoped writes carry the facility in `meta.accounts`; `@asc/fhir` moves to it in PR #56. Spike S1 is re-run with `meta.accounts` before P04 depends on it.
- Stamping is enforced in the P04 client layer (`forFacility(id)` stamps every create, update and patch), not only in the P03 builders, because a resource that did not come from a builder (a read-modify-write, a patch) would otherwise lose it. A lint rule bans raw create and update calls in apps ([P04 plan](../plan/phases/P04-medplum-clients.md)).
- A patient seen at a second facility gets that facility through `$set-accounts`. **Decided in [#59](https://github.com/imRahul05/ASC-EHR/issues/59) (Q-FHIR-ACCT, 2026-10-09):** a per-tenant setting `patientRecordSharing`. `on-encounter` is the default for facilities that form one covered entity: on the patient's first scheduling or registration at a new facility, the API adds that facility with `propagate: true` and audits it as `patient.facility_added`. `isolated` is for separate legal entities: the facility is added without propagation, and prior records cross only through an audited records request. The flow only adds accounts; removal is an audited admin action with a reason. The value is recorded per tenant at onboarding with the customer's compliance contact.

**Decision 2 (step-up).** The option C contract stays. A fresh login is not an electronic signature: it shows session freshness, but does not capture signature components at signing (21 CFR 11.200) or bind the signature to the record (11.70), and a stolen token pair can approve any step-up action inside the window. **Decided in [#58](https://github.com/imRahul05/ASC-EHR/issues/58) (Q-IAM-F, 2026-10-09):**
- **Signatures use a nonce-bound ceremony.** This covers note finalization, attestations and order signing.
  - `POST /signing-sessions` binds a single-use nonce (Redis, 2 minutes) to the items' ids, versions and content hashes.
  - The clinician re-authenticates with password and TOTP, passing the nonce.
  - `POST /signing-sessions/:id/complete` verifies the JWKS signature, that the nonce matches and is consumed once, that `auth_time` is no more than 60 s old, that `sub` and `login_id` match the access token, and that the content hash is unchanged.
  - The API, with the user's token, sets the notes to `final` and writes `Provenance.signature`. Batch signing is allowed, which keeps a full day's signing under the login throttle.
- **Option C stays for step-up that is not a signature** (`admin.*`, break-glass, exports).
- **Principals that cannot sign.** The `agent` and `service` kinds can never sign. Agent-drafted content records the agent run as contributor and the clinician as attester.
- **Controlled-substance e-prescribing** (DEA 21 CFR 1311) goes through a certified e-prescribing vendor; it is not built in-house.
- **Regulations.** They are taken as CMS 42 CFR 416.47, state law and HIPAA, and the design also meets 21 CFR Part 11 §11.50, §11.70 and §11.200. Each customer's compliance contact confirms this at onboarding.
- **Verified:** Medplum puts the OIDC `nonce` into the `id_token`.
- **Still to check before the signing route:** whether the login throttle counts per user or per address.

**Decision 3 (`writeConstraint` order).** Report it to Medplum with the live spike as the reproduction. The report is drafted below; filing it is a human action (it publishes to an external tracker). The existing rules (one entry per constrained type per facility, the registry test, the gate-4 lock on `final` notes) stay.

> **Title:** `writeConstraint` is skipped when another access entry for the same resource type comes first
> **Version:** Medplum server 5.1.42 (self-hosted, Docker).
> **Setup:** one `ProjectMembership` with two `access[]` entries for the same user, both parameterized with the same `%facility`. Policy P1 grants `Composition` with `writeConstraint` `%before.status != 'final'`; policy P2 grants `Composition` (read and write) without a `writeConstraint`.
> **Steps:** create a `Composition` with `status: final`; update it with that user's token. Repeat with the order of the two entries swapped.
> **Expected:** the update is refused (403) in both orders, as for a membership with P1 alone.
> **Actual:** refused when P1 is the first entry; accepted (200) when P2 is first.
> **Note:** `hiddenFields` (any entry hides) and `readonly` (any entry allows) are independent of order in the same setup.

**Decision 4 (grants from `PractitionerRole`).**
- (a) **"Drift fails safe" holds only for actions that end in a FHIR call made with the user's token.** App Postgres data (RLS on the principal's `facility_id`), AI agent runs, SSE channels, exports and worker jobs that run as `system-worker-v1` rely on gates 3 and 4 alone. So writing a role-grant `PractitionerRole` is as sensitive as writing a membership. Rules: no staff `AccessPolicy` may write a `PractitionerRole` carrying the role-template code system (`https://asc-ehr.app/role-template`), pinned by a policy test; grant `PractitionerRole`s carry a distinct `meta.tag` so they are never confused with directory entries (scheduling, specialty); worker jobs re-check the starting principal's grant when they run.
- (b) **The provisioner becomes a reconciler.** `PractitionerRole` is the desired state; `ProjectMembership.access[]` is compiled from it. The reconciler is idempotent, runs on every admin write and on a periodic sweep, writes an `AuditEvent`, and alerts when it corrects drift (for example a membership edited by hand in the Medplum App). It is the only holder of project-admin credentials and does not run in `apps/api`. Drift is then corrected, not only detected.
- (c) Reading the user's `PractitionerRole`s with the **user's** token (directory data is staff-readable, S1), which also proves the token is live, instead of `api-service-v1`. **Decided in [#57](https://github.com/imRahul05/ASC-EHR/issues/57) (Q-IAM-E, 2026-10-09):** adopted on every request. `api-service-v1` is retired from `apps/api`, so the public API tier holds no Medplum client secret. `apps/worker` re-checks the acting user's grant before each step that reads or writes PHI, with an in-process memo of at most 5 s per job. This supersedes #49's confirmation of the narrow API client.

**Decision 5 (revocation and cache).** **Decided in [#57](https://github.com/imRahul05/ASC-EHR/issues/57) (2026-10-09):**
- Grants are not cached across requests; they are memoized within one request only.
- Only `/auth/me` facts that cannot change for a given token (project, membership, profile) are cached, by token hash, for that token's lifetime.
- So our revocation delay is Medplum's: immediate.
- The 60 s grant cache, the admin-action invalidation hooks, the step-up cache bypass and the membership webhook are dropped.
- Fallback only if the P05i load test fails: a cache of at most 5 s, shared in Redis and keyed by membership, never per-instance memory.

**Scale (new).** A user with access at many facilities has one `access[]` entry per facility, and Medplum adds one criterion per entry to every search. Load-test a membership with about 40 entries before the first multi-site customer. Mitigation if needed: region or group `Organization`s added to `meta.accounts`, so float staff need one entry per region.

**Decisions (recommended 2026-10-08; #57, #58 and #59 decided 2026-10-09 by adopting the recommendation and closed).** Each issue comment carries the decision and its healthcare rationale. #60 is still open.
- [#57](https://github.com/imRahul05/ASC-EHR/issues/57) (decided): `apps/api` reads grants with the user's token on every request, no cross-request grant cache (only per-token `/auth/me` facts cached for the token's lifetime), `api-service-v1` retired from `apps/api`; the worker re-checks the acting user's grant before each step that reads or writes PHI.
- [#58](https://github.com/imRahul05/ASC-EHR/issues/58) (decided): the nonce-bound signing ceremony for signatures; option C stays for step-up that is not a signature (`admin.*`, break-glass, exports); controlled-substance e-prescribing through a certified EPCS vendor.
- [#59](https://github.com/imRahul05/ASC-EHR/issues/59) (decided): a per-tenant `patientRecordSharing` setting, default `on-encounter` (`$set-accounts` with `propagate` when a patient is first seen at another facility of the same covered entity), `isolated` for separate legal entities.
- [#60](https://github.com/imRahul05/ASC-EHR/issues/60) (Q-IAM-G, new): one worker `ClientApplication` per (tenant, facility), so Medplum enforces facility (gate 5) for background jobs and AI agent runs too, not only our code. Recommended option 2, **still open**.

**Live audit (2026-10-08, local Medplum 5.1.42, synthetic seed).**
- **Admin self-grant (found and fixed in [PR #61](https://github.com/imRahul05/ASC-EHR/pull/61)).** The `admin` template writes `PractitionerRole` through the shared directory rule and created a role grant for itself at the second facility (201) and edited its own grant (200); both were reverted. Harmless today (the membership is unchanged, so gate 5 still refuses), but an escalation into gates 3 and 4 once P05i trusts `PractitionerRole`. PR #61 makes `PractitionerRole` read-only for every staff role (admin template v2), so only the seed or provisioner writes grants, and adds a live 403 test for every staff role (65/65). The other seven staff roles already got 403.
- **Grant reads with the user's token work.** All eight seeded staff users read their own role grant with their own token (200, one result each, matching the seed).
- **The seed's `PractitionerRole`s have no `active` field**, so `active=true` returns none. Fixed in PR #61: the seed writes `active: true` and `period.start` and repairs older grants; the provisioner must do the same.
- **OIDC `nonce` is carried into the `id_token`** when passed at `/auth/login` (checked for two roles), which is the prerequisite for the #58 ceremony (decided). Still open: whether the login throttle is per user or per address.

## More Information

- Access policies: https://www.medplum.com/docs/access/access-policies
- Server config: https://www.medplum.com/docs/self-hosting/server-config
- Spike definitions: [08 §14](../product/08-identity-access-and-tenancy.md), [P05 plan](../plan/phases/P05-auth-roles.md)
