---
status: proposed
date: 2026-10-08
decision-makers: Engineering lead (pending ratification — record name and date here, then set status to accepted)
---

# Medplum 5.1.42 spike results (S1, S1b, S6, S7) and the fallbacks we adopt

## Context and Problem Statement

The [identity ADR](2026-10-03-medplum-as-identity-and-access-platform.md) rests on Medplum behaviours that the P05 plan marked "confirm before use" (decision D-A13). P05h ran them against the local stack (Medplum 5.1.42) with synthetic data. The runnable evidence is `apps/bots/live/*.live.ts`; run it with `pnpm medplum:up && pnpm medplum:seed && pnpm --filter bots test:medplum`. Each assertion pins what the server does, so a Medplum upgrade that changes it fails there. It signs in four times per run and Medplum throttles logins to 5 per window, so wait about a minute between full runs.

Every spike passes or has a fallback below. Two plan assumptions did not hold (S7, and the webhook half of S6) and one new rule appeared (S1, `meta.account`). The one open choice, step-up auth time (decision 2), was decided in issue #49.

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

1. **Every facility-scoped write names its facility (`meta.account`).** A plain read returns `meta` with only `versionId` and `lastUpdated`, and Medplum checks the criteria against the *new* version, so a read-modify-write that sends the body back as read is refused (403). The Medplum client's reads include the account; plain HTTP reads do not. `@asc/fhir` (P03) builders stamp `meta.account` on every facility-scoped resource, `@asc/api-client` (P04) never writes a body without it, and a test per write path proves it. The same rule stops a facility user creating or moving a resource into another facility (403).
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
5. **Revocation at Medplum is immediate; our cache is the only delay.** Measured on the next request after the change: disabled client membership 3 ms, disabled signed-in user 2 ms, edited `AccessPolicy` 4 ms, changed membership access list 1 ms (all 401 or 403). A token issued to a disabled client is still *issued* but refused when used, so token issuance is not a gate. The worst case for gates 1 to 4 is therefore our identity cache TTL (60 s, P05i). **Not shown:** a Medplum `Subscription` that calls us when a membership changes. On the local stack a subscription on `ProjectMembership` failed the subscription access-policy check (server log: "Access Policy not satisfied"), and a control subscription on `Patient` was not delivered within 10 s even though a container on the Medplum network reaches the host receiver. P05i must not depend on it: it clears the cache from our own admin actions and keeps the 60 s TTL, and the webhook is retried as a separate, measured task before anyone writes that it works. Dropping it for now was confirmed in #49.

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

## More Information

- Access policies: https://www.medplum.com/docs/access/access-policies
- Server config: https://www.medplum.com/docs/self-hosting/server-config
- Spike definitions: [08 §14](../product/08-identity-access-and-tenancy.md), [P05 plan](../plan/phases/P05-auth-roles.md)
