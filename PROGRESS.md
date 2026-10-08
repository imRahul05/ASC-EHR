# PROGRESS — GI ASC EHR

> Single source of truth for **what is done, what is running, what is next**.
> Plan: [`docs/plan/implementation-plan.md`](docs/plan/implementation-plan.md) · Phase files: [`docs/plan/phases/`](docs/plan/phases/) · Mistakes log: [`LEARNING_MISTAKES.md`](LEARNING_MISTAKES.md)

## How agents update this file (mandatory)

1. **Start of a phase:** set its row to `in-progress`, fill *Owner* (agent/session or person) and *Branch*, commit alone: `chore(progress): start Pxx`.
2. **During:** if you split a phase (`P15a`/`P15b`), add rows; if you hit a blocking question, set `blocked` and add it to §4.
3. **End of a phase:** set `done`, fill *PR* and *Finished*, add a line to §3 *Done log* (newest first), move follow-ups to §5 *Next up*, recompute which phases are now `ready` (all deps `done`).
4. Keep entries factual and short. No PHI, no secrets, no customer names.
5. Sub-agents do **not** edit this file; the orchestrating agent does, after verifying their work.

**Status values:** `ready` (deps done) · `pending` (waiting on deps) · `in-progress` · `blocked` (open question/external) · `review` (PR open) · `done`.

---

## 1. Snapshot (update on every phase change)

| Updated | 2026-10-08 |
|---|---|
| Current wave | 0 |
| In progress | P05h (P05a–P05g and P02 merged) |
| Ready to start | P00b, P01, P03, P09, P05h, P06 (needs Azure access) |
| Blocked | P13 soft-blocked on Q-MS1 (fallback allowed) |
| Go-live target | 2026-12-07 |

## 2. Phase board

| ID | Phase | Status | Depends on | Owner | Branch | PR | Started | Finished |
|---|---|---|---|---|---|---|---|---|
| 2026-10-01 | Web | Landing hero: headline and right column (copy + CTAs) now start on the same line — grid `items-start` plus `text-box: trim-start cap alphabetic` on headline and lede so cap tops align despite different font sizes | branch `worktree-hero-top-align` |
| 2026-09-30 | Web | Landing interactivity: walkthrough player (sidebar/tab chapters, pause on hover, scoped keys, offscreen pause, reduced motion, accessible scrubber); clickable hero stations linked to player chapters / workflow steps; workflow scroll-spy; AI section provenance tooltips + resolve-gap-then-sign demo; modules hover spotlight + step links; stats count-up; section reveal | branch `worktree-landing-interactivity` |
| P00 | Repo hygiene, guardrails | done | — | Claude (session fe18af87) | `worktree-docs-mindscript-wiring`, `worktree-p00-close` | #9 (+ close-out PR) | 2026-09-27 | 2026-09-28 |
| P00b | Library upgrades (zod 4, bullmq 6, ioredis 6) | ready | P00 | | | | | |
| P01 | CI + eval gate | ready | P00 | | | | | |
| P02 | Local Medplum + bots skeleton | done | — | Claude (bg job 640ebd7d) | `phase/P02-local-medplum-clean` | [#43](https://github.com/imRahul05/ASC-EHR/pull/43), [#44](https://github.com/imRahul05/ASC-EHR/pull/44) (#42 closed, replaced by #43) | 2026-10-07 | 2026-10-07 |
| P03 | `@asc/fhir` | ready | — | | | | | |
| P04 | Medplum clients | pending | P02, P03 | | | | | |
| P05 | Auth + roles (sub-phases P05a–P05j below) | in-progress (P05a–P05g done; P05h in progress) | P05h: P02 · P05i–j: P04 | | | | | |
| P06 | Azure infra (dev) | ready (external: subscription/BAA) | — | | | | | |
| P07 | `@asc/clinical-rules` | pending | P03 | | | | | |
| P08 | Terminology + profiles | pending | P02, P03 | | | | | |
| P09 | UI clinical kit | ready | P00 | | | | | |
| P10 | Realtime SSE | pending | P04 | | | | | |
| P11 | Questionnaire renderer | pending | P03, P09 | | | | | |
| P12 | Worklists on Task | pending | P05, P07 | | | | | |
| P13 | Record engine port | pending | P09, Q-MS1 | | | | | |
| P14 | Registration | pending | P05, P09 | | | | | |
| P15 | Scheduling + whiteboard | pending | P14, P07, P10 | | | | | |
| P16 | H&P + med-hold | pending | P11, P13, P10, P07 | | | | | |
| P17 | Pre-op + consent | pending | P11, P15 | | | | | |
| P18 | Procedure capture | pending | P15, P10 | | | | | |
| P19 | Procedure-note pipeline | pending | P18, P13, P08, P12 | | | | | |
| P20 | AIMS flowsheet | pending | P15, P09 | | | | | |
| P21 | PACU + discharge | pending | P11, P20 | | | | | |
| P22 | Coding + charge export | pending | P19, P08 | | | | | |
| P23 | Pathology loop | pending | P18, P12 | | | | | |
| P24 | Fax + eCW | pending | P10, P12, Q-MS4/5 | | | | | |
| P25 | Scope log + adverse events | pending | P11, P12 | | | | | |
| P26 | Go-live hardening | pending | P19, P20, P22, P06, P05 | | | | | |

**P05 sub-phases** ([plan](docs/plan/phases/P05-auth-roles.md): modular single-hospital core, tenant-ready; gated follow-ups in P05 §6; Customer #2 in [future-multi-tenancy-architecture.md](docs/product/future-multi-tenancy-architecture.md))

| ID | Sub-phase | Status | Depends on | Owner | Branch | PR | Started | Finished |
|---|---|---|---|---|---|---|---|---|
| P05a | Contracts + `@asc/authz` core (`can()`, ports) | done | — | | `phase/P05a-authz-core` | [#24](https://github.com/imRahul05/ASC-EHR/pull/24) | 2026-10-06 | 2026-10-06 |
| P05b | Role templates, workspaces, lint guard | done | P05a | | `phase/P05b-roles-workspaces` | [#25](https://github.com/imRahul05/ASC-EHR/pull/25) | 2026-10-06 | 2026-10-06 |
| P05c | Policy compiler | done | P05b | | `phase/P05c-policy-compiler` | [#26](https://github.com/imRahul05/ASC-EHR/pull/26) | 2026-10-06 | 2026-10-06 |
| P05d | Web on capabilities (P05d1, P05d2) | done | P05b | | `phase/P05d2-workspaces` | [#32](https://github.com/imRahul05/ASC-EHR/pull/32), [#35](https://github.com/imRahul05/ASC-EHR/pull/35) | 2026-10-06 | 2026-10-06 |
| P05e | App-DB tenancy (RLS, `withTenant`) | done | P05a | Claude (bg job 640ebd7d) | `phase/P05e-db-tenancy` | [#36](https://github.com/imRahul05/ASC-EHR/pull/36) | 2026-10-06 | 2026-10-06 |
| P05f | Durable audit | done | P05e | Claude (bg job 640ebd7d) | `phase/P05f-durable-audit` | [#38](https://github.com/imRahul05/ASC-EHR/pull/38) | 2026-10-06 | 2026-10-07 |
| P05g | API security spine | done | P05a, P05e, P05f | Claude (bg job 640ebd7d) | `phase/P05g-api-security-spine` | [#40](https://github.com/imRahul05/ASC-EHR/pull/40) | 2026-10-07 | 2026-10-07 |
| P05h | Medplum hardening, spikes, seed, policy test | in-progress | P05c, P02 | Claude (bg job 7f0d4791) | `phase/P05h-medplum-hardening` | | 2026-10-08 | |
| P05i | Medplum identity in API | pending | P05g, P05h, P04 | | | | | |
| P05j | Web sign-in | pending | P05d, P05i, P04 | | | | | |

## 3. Done log (newest first)

Work completed before this plan existed, grouped from git history (`origin/main` @ `6586423`):

| Date | Area | What | Ref |
|---|---|---|---|
| 2026-10-07 | Platform | **P02** local Medplum: `pnpm medplum:up` starts Medplum server and admin app 5.1.42 with their own Postgres and Redis (compose profile `medplum`, host ports 8203/3003/5443/6390, localhost only); `pnpm medplum:seed` creates the project (`Project/$init`), a facility, one synthetic practitioner per staff role and the web (PKCE), api and worker client applications, idempotently (byte-identical second run); `apps/bots` skeleton (esbuild, lint, tests); `MEDPLUM_*` and `NEXT_PUBLIC_MEDPLUM_*` env validated in `@asc/config`; the seed refuses anything but localhost. **No committed passwords**: credentials are generated per machine into git-ignored `infra/medplum/.local` (GitGuardian flagged the first version, #42, closed and replaced by #43; LM-019). Review hardening in #44: Redis refuses to start without a password, a missing config fails the start instead of becoming a directory, damaged credentials give one friendly error, `medplum:down` needs no credentials, esbuild paths independent of cwd (LM-020). Seeded api/worker clients have full project access: local-only, least-privilege policies tracked in P05h | PRs #43, #44 (#42 closed) |
| 2026-10-07 | Auth | **P05g** API security spine (`apps/api`): helmet; explicit request pipeline tenant (gate 1, 404) → flood limit (tenant and address) → identity through `IdentityPort` (gate 2: 401, 503 when the provider is down; step-up capabilities bypass the cache; per tenant-and-user limit) → facility and capability (gates 3 and 4: route parameter, loaded resource via `app.guards`, or all-site only); default-deny (a route without `config.auth` stops the app starting; route inventory test lists the public routes); every denial audited with its gate and decision provenance; `GET /me`; durable append-only audit store required in staging and production; dev-only fake identity refused there (**a deployed API does not start until P05i**); `@asc/config`: `resolveTenantRef`, `GIT_SHA`, rate-limit knobs; found by an attack test: the rate limit did not count failed authentications (LM-018); api 81 tests; decisions in [P05 plan](docs/plan/phases/P05-auth-roles.md) | PR #40, branch `phase/P05g-api-security-spine` |
| 2026-10-07 | Auth | **P05f** durable audit: `@asc/audit` events carry tenant, facility, membership, session, gate (1–5) and decision provenance (role versions, catalog version, cache state, validated); IAM vocabulary (`auth.*`, `membership.*`, `role.*`, `user.invited`) with a typed `iamEvent` builder and ID-only details; client IP stored as a /24 or /48 prefix; production requires a durable **and** append-only store; `audit_events` table (runtime role `SELECT, INSERT` only, RLS forced, triggers reject UPDATE/DELETE/TRUNCATE even for the owner); `createPostgresAuditStore` over `withTenant`; `withTenant` now rethrows driver failures as `DatabaseError` (SQLSTATE and constraint only, recognised by class) so bound values such as `agent_runs.output` never reach logs; `@asc/db` 74 and `@asc/audit` 36 tests; decisions in [P05 plan](docs/plan/phases/P05-auth-roles.md); LM-016, LM-017 | PR #38, branch `phase/P05f-durable-audit` |
| 2026-10-06 | Auth | **P05e** app-DB tenancy: `agent_runs.tenant_id` (NOT NULL, backfilled from `app.default_tenant_id`) and `facility_id`; row-level security enabled and **forced**, fail closed without `app.tenant_id`; owner vs runtime roles (`asc_runtime`: no ALTER, DELETE, TRUNCATE or RLS bypass); `createTenantDb().withTenant` is the only client the package exports (owner client in `@asc/db/migrate`); run store takes a tenant/facility scope; config `DEFAULT_TENANT_ID`, `MEDPLUM_PROJECT_ID`, `DATABASE_RUNTIME_URL`; 49 DB tests (skipped without `TEST_DATABASE_URL`, CI guard fails if skipped); decisions in [P05 plan](docs/plan/phases/P05-auth-roles.md); LM-015 | PR #36, branch `phase/P05e-db-tenancy` |
| 2026-10-06 | Auth | **P05d** web on capabilities (mock auth): Principal in session, `useCan`/`Can`/`RequireCapability`, `RouteGuard` driven by `ROUTE_ACCESS`, workspaces and facility switcher, role labels from `@asc/authz` templates, `ParticipantRole` split from authz roles, access request instead of self-signup, `UserRole` removed, role-name lint baseline empty, tech identity added with config only | PRs #32, #35 (+ #33, #34 docs/progress) |
| 2026-10-06 | Auth | **P05c** policy compiler in `@asc/authz`: templates compiled to parameterized `AccessPolicy` JSON (facility criteria, hidden/readonly fields, signed-note write constraint, `shared` directory data without facility filter), deterministic snapshots; no `@medplum/*` dependency yet | PR #26 |
| 2026-10-06 | Auth | **P05b** role templates, workspaces, lint guard: role template registry and the D-A7 roles, grants built from assignments (per facility), workspace resolver from capabilities, `asc/no-role-name-comparison` lint rule, role × capability matrix snapshot | PRs #25, #29 (role-gap follow-up), #31 (rn `case.cancel` removed, coder `ai.generate` added) |
| 2026-10-06 | Auth | **P05a** contracts and `@asc/authz` core: capability catalog, `Principal`/`Grant`/`TenantRef`/`RoleTemplate` types, authz Zod schemas, `can()` with facility-scoped grants, `authorize()` with gate and reason, `IdentityPort`/`TenantResolver` with `StaticTenantResolver` | PR #24 |
| 2026-10-06 | Auth | P05b follow-up (before P05d): admin `case.read`/`whiteboard.read`, anesthesia `note.edit`, the 11 unassigned capabilities assigned, directory/task/clinical data types added to roles (directory data `shared`: no facility filter), 08 §7.3/§7.4 synced, orphan-capability test; reviews feed LM-014 | branch `phase/P05b-followup-role-gaps`, PR #29 |
| 2026-10-05 | Docs | Auth hardening from architecture review (D-A14–D-A19): IdP flexibility via federation into Medplum (not Medplum portability), identity-cache bypass + invalidation (Subscription webhook), AI `agent` principal kind, decision provenance in audit, hybrid token handling + CSP, spike S6 restored, workflow × capability matrix test in P07, compliance controls in P26 | branch `worktree-iam-hardening-updates` |
| 2026-10-05 | Docs | Auth plan folded from 18 IAM phases into P05 sub-phases P05a–P05j: modular single-hospital core (ports `IdentityPort`/`TenantResolver`, per-facility grants, roles as data, workspaces), Medplum hardening + spikes + policy test (P05h), durable audit (P05f), gated follow-ups (step-up, worker/SSE auth, break-glass, SSO, multi-tenancy); multi-tenant design kept in `future-multi-tenancy-architecture.md`; 08 `Principal` fixed to per-facility grants; ADR kept `proposed` pending ratification | branch `worktree-iam-implementation-plan`, PR #21 |
| 2026-10-03 | Docs | Identity, access control & multi-tenancy design (proposed): Medplum as IdP + data-authz, tenant = Project, facility = Organization, capabilities + role templates, 5 authorization gates, realtime/service-to-service security, IAM track I0–I18 with dependency matrix (not yet merged into the plan) + ADR | branch `worktree-docs-iam-tenancy-design` |
| 2026-10-01 | Web perf | Tree-shaking & dynamic code-splitting: package manifests (`@asc/api-client`, `@asc/clinical-rules`, `@asc/validation`, `@asc/config`, `@asc/types`, `@asc/ui`) declare `sideEffects` and guarded by manifest tests; expanded ESLint guard for routes/auth/landing (`src/app/**`, `src/components/auth/**`, `src/features/landing/**`) with 6 landing client components converted to leaf imports; Server Components & forms in `(auth)` migrated to `@asc/ui` leaf imports eliminating client barrel leaks (SignaturePad, CommandPalette, Sheet); `DEMO_EXPLAINER` extracted to isolated data module; all 8 case tabs code-split dynamically via `next/dynamic` with `<LoadingSkeleton variant="detail" />` and tab hover/focus preloading (`TabsTrigger` `preload` on pointer enter & focus); `CommandPalette`, `WelcomeDialog`, `TourChecklist`, and `PageHelpSheet` dynamically imported (`ssr: false`); `providers.tsx` converted to leaf imports; perf budgets tightened (`/login` 376→307 KB gz, `/signup` 366→294 KB gz, `/cases/[caseId]` 267→185 KB gz); `bundles.test.ts` passes 9/9 | PR #19, branch `perf/tree-shaking-and-mobile-css-optimization`, LM-011 |
| 2026-10-01 | Web perf | [Plan](docs/plan/web-performance-plan.md): case tab components out of shell routes (`case-tab-ids.ts`), landing Server Components on `@asc/ui` leaf imports + `"sideEffects"` on `@asc/ui`, MSW started only in `(auth)`/`(dashboard)`; inline CSS evaluated and not adopted (mobile FCP/LCP worse, HTML 33→110 KB). Bundle guard `pnpm --filter web build && pnpm --filter web test:bundles` with budgets. Demo build, gz initial JS: /dashboard 432→349 KB, / 350→294 KB, /_not-found 324→242 KB; Lighthouse `/` mobile LCP 3682→3357 ms, unused JS 166→48 KiB. Open: `/login` simulated mobile LCP 3462→3760 ms (observed unchanged; more, smaller chunks on an HTTP/1.1 lab server) — re-measure on an HTTP/2 preview | branch `worktree-plan-web-performance` |
| 2026-09-30 | Web | Landing hero height capped at 56rem (`min(100svh - nav, 56rem)`) so 24"/27" monitors no longer open a large gap between headline and journey line; laptop/tablet/mobile unchanged | branch `worktree-fix-hero-tall-screens` |
| 2026-09-30 | Deploy | Env-driven web ↔ api wiring: `CORS_ORIGINS` allowlist (`@fastify/cors`, deny by default when deployed), production web build fails without `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_API_MOCKING=enabled` opt-in for the hosted demo, `buildUrl` keeps a base path; guide `docs/DEPLOYMENT_CONFIGURATION.md` + ADR | branch `worktree-feat-env-driven-api-url-cors`, LM-010 |
| 2026-09-30 | Fix | Vercel build of `apps/api` failed with TS2688 (temp tsconfig in `/tmp`); fixed with relative `typeRoots` | PR #13, LM-009 |
| 2026-09-29 | Web | Landing hero redesigned: full-viewport aurora canvas (violet/teal/rose), left-aligned headline, animated patient-journey line (referral → recall) with timed event cards; reduced-motion shows a static drawn journey. Rest of landing unchanged | branch `new-landing-page` |
| 2026-09-28 | P00 | Closed: boundary lint fixture tests (`app-boundaries.test.js`: banned imports, exported types/Zod, `process.env`, browser subpaths); decision P00-Q1 recorded → new phase P00b | close-out PR |
| 2026-09-27 | P00 | Web HTTP client, `ApiError`, auth/dashboard request functions moved to `@asc/api-client` (fetch, timeout from config, tests); API/dashboard types to `@asc/types`; error schema + data-driven signup schema (`SIGNUP_ROLE_FIELDS`) to `@asc/validation`; API routes/timeout/runtime env helpers in `@asc/config` | PR #9 |
| 2026-09-27 | P00 | Lint guardrails: app boundaries (banned imports, no exported types/Zod in apps), browser leaf-subpath imports, `process.env` only in `@asc/config`, custom `asc/max-hooks-per-component` rule (+ tests) | PR #9 |
| 2026-09-27 | P00/P05/P09 (partial) | Mock layer → MSW (`apps/web/src/mocks`); auth session in memory only + `RequireAuth` guard; login/signup rebuilt config-driven (`FieldConfig` + `FormField`); icons/theme/`KpiCard` via `@asc/ui`; `useIsMobile` → `useSyncExternalStore`; audit/logger/telemetry env via `@asc/config/runtime` | PR #9 |
| 2026-09-27 | Fix | apps/web pages returned 500 since `abaacbb` (Turbopack could not resolve `@asc/validation` `.js` re-exports) — fixed with leaf subpath exports; verified in browser (login, demo login, role switch, signup, logout, theme) | PR #9, LM-005 |
| 2026-09-27 | Docs | Phase-wise implementation plan, 27 phase files, UI guidelines, PROGRESS + LEARNING_MISTAKES protocol | branch `worktree-docs-mindscript-wiring` |
| 2026-09-27 | Docs | MindScript overview + integration/wiring guide (06), product docs reconciled, colour block diagrams | `cc97877`, `b0b4596` |
| 2026-09-27 | Agents | Prompt caching for agent instructions + ADR | `115f119`, `0057f19` (PR #8) |
| 2026-09-26 | Docs | Agent memory/skills proposal, review, action plan; Mem0/Langfuse/Supermemory evaluation | `73ecc94`…`db72216` (PR #6, #7) |
| 2026-09-26 | Data | `@asc/db` (Postgres + Drizzle), local Postgres, agent run store | `9727aef` |
| 2026-09-26 | Agents | Gateway hardening (stateless providers, deadlines, refusal, usage, telemetry); run-state store; provenance context | `657d638`, `e8b695a` |
| 2026-09-26 | Worker | Split AI queues (interactive/background), job PHI hygiene; job contracts moved to shared packages | `41f3aee`, `abaacbb` |
| 2026-09-26 | Tooling | Dev-time skills: create-agent, change-agent-prompt, add-model, phi-review | `770366c` |
| 2026-09-25 | Web | Persona login/signup + role dashboards (mock data), axios client, Base UI fixes | `30295d7`…`881ed5a` |
| 2026-09-25 | Agents | Agent definition layer, typed model/provider/hosting config, BAA-gated PHI routing, `discharge-instructions` agent | `aebb379`…`f25e992` |
| 2026-09-25 | Platform | Logging/telemetry/audit packages with PHI redaction, fail-closed audit; JIT packages, tsup, OTel preload, env validation | `bec944d`, `afda8d3`, `c75d1ca` |
| 2026-09-25 | Docs | Product requirements, build/reuse matrix, target architecture, flows, delivery plan; ADRs; compliance; environments | `4233c6e` and others |
| 2026-09-25 | Repo | Turborepo scaffold (web/api/worker + packages), scope `@asc/*`, TS 7 + type-aware lint | `cf4d9fa`, `edfa04d`, `c1dfdf3` |

## 4. Blocked / open questions (cross-phase)

| ID | Question | Blocks | Owner | Status |
|---|---|---|---|---|
| Q-MS1 | Access to `Wybit-LLC/MindScript` source | P13, P16, P19, P22, P24 | eng lead | open |
| D1/Q10 | Medplum self-host vs hosted | P06, P26 | eng lead | **decided 2026-10-03** → self-host only, no hosted fallback |
| P00-Q1 | Upgrade zod 4 / bullmq 6 / ioredis 6 / OTel before Wave 2? | P07+ | eng lead | **decided 2026-09-28** → P00b; OTel deferred |
| Q4 | Biller file format | P22 | business | open |
| Q8 | CPT licence | P08, P22 | business | open |
| Q15/Q-MS7 | STT vendor + BAA | P18 | eng | open |
| Q-MS4/5 | faxagnet + Integuru hosting/BAA/outbound | P24 | MindScript team | open |
| Q-API-1 | Deployed API is paused until P05i: it refuses to start in staging and production (no real identity adapter; the dev fake is refused), so the API Vercel project shows failed deployments. The demo is unaffected (in-browser mocks). Pause its deploys in Vercel (Ignored Build Step `exit 0`) or accept the failures until P05i ([deployment doc §B](docs/DEPLOYMENT_CONFIGURATION.md)) | none for the demo; any real API deployment | eng lead | open |
| Q-AUDIT-1 | An *allowed* PHI read whose audit write fails: proposal 503 and no data. Denials are already never skipped ([P05g decision 6](docs/plan/phases/P05-auth-roles.md)) | first PHI route (P12/P14) | eng lead | open: decide before the first PHI route |
| Q-IAM-C | Workspace overlap: roles whose capabilities are a subset of another's (tech ⊂ nurse/physician) appear as an extra workspace option in the switcher. Add `hiddenWhen` to workspace definitions? ([P05 §4 P05d decisions](docs/plan/phases/P05-auth-roles.md)) | none (UX only) | eng lead | open: accepted for now |

Full lists: [implementation plan §6](docs/plan/implementation-plan.md#6-cross-phase-open-questions), each phase file, [05 §5.4](docs/product/05-delivery-plan.md), [06 §7](docs/product/06-mindscript-integration.md#7-open-questions-for-the-mindscript-team).

## 5. Next up

1. **P05h** Medplum hardening, spikes, seed and the policy test (needs P02 and P05c, both done; P05i needs P05h and P04): run it against the local stack from `pnpm medplum:up`. It also owns narrowing the seeded `asc-ehr-api` and `asc-ehr-worker` clients (checklist item in the P05 plan). **P00b** library upgrades (zod 4, bullmq 6, ioredis 6) must land before Wave 2. In parallel: **P01** CI (must run a Postgres service and set `TEST_DATABASE_URL`; the GitGuardian check runs on every PR to `main`). P06 must set `trustProxy` and revisit the per-address flood limit behind Front Door.
2. In parallel: **P03** `@asc/fhir` (the last gate for P04 and P08; P02 is done).
3. Escalate week-1 questions: Q-MS1, Azure subscription/BAA (P06), Q8 CPT licence.
4. Wire `pnpm --filter web build && pnpm --filter web test:bundles` and Lighthouse CI into **P01** CI; re-measure `/login` mobile LCP on an HTTP/2 deploy preview (see web perf done-log entry).

## 6. Decisions log

| Date | Decision | Where recorded |
|---|---|---|
| 2026-10-07 | No password literal in the repo, not even a dev-only one: local stack credentials are generated per machine into a git-ignored folder, committed templates hold placeholders, and a test fails on a literal | [P02 decisions](docs/plan/phases/P02-local-medplum.md), LM-019 |
| 2026-10-03 | Medplum is self-hosted from the open-source code (upstream images, Azure); the Medplum-hosted service is not used, not even as a fallback (D1) | [05 §5.2](docs/product/05-delivery-plan.md), [identity ADR](docs/decisions/2026-10-03-medplum-as-identity-and-access-platform.md) |
| 2026-09-30 | API URL, CORS origins and demo mocking are env-only; exact-origin CORS allowlist, no credentials (Bearer); Azure: `app.`/`api.` subdomains or `/api` reverse proxy | [ADR](docs/decisions/2026-09-30-env-driven-api-url-and-cors-allowlist.md), [guide](docs/DEPLOYMENT_CONFIGURATION.md) |
| 2026-09-28 | Upgrade zod 4 + bullmq 6 + ioredis 6 before Wave 2 (P00b); defer OpenTelemetry 0.222 and React 19.3 | [P00b](docs/plan/phases/P00b-library-upgrades.md) |
| 2026-09-27 | Execution follows `docs/plan/implementation-plan.md`; 05 Gantt superseded for scheduling | this file |
| 2026-09-27 | SSE client = fetch + `eventsource-parser` (bearer auth); `cmdk` excluded (Radix) | [UI guidelines](docs/agent/ui-guidelines.md) |
| 2026-09-27 | Dev API mocks = MSW intercepting real `@asc/api-client` fetches (UI never imports mock data) | [UI guidelines §1](docs/agent/ui-guidelines.md) |
| 2026-09-27 | Browser code imports leaf subpaths of `@asc/validation` / `@asc/config`; browser-only packages (`@asc/ui`, `@asc/api-client`) use `bundler` resolution | LM-005 |
| 2026-09-27 | Hook budget per component (useState ≤ 2, useEffect ≤ 1, useRef ≤ 2) enforced by `asc/max-hooks-per-component`; forms are config-driven | [UI guidelines §3a](docs/agent/ui-guidelines.md), LM-003 |
