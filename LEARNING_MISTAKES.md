# LEARNING_MISTAKES — corrected mistakes become rules

> Every agent reads this file **before writing code**. It is the repo's memory of mistakes that a human (or review) had to correct, so they are not repeated.
> Related: [`AGENTS.md`](AGENTS.md) · [architecture rules](docs/agent/architecture.md) · [UI guidelines](docs/agent/ui-guidelines.md) · [`PROGRESS.md`](PROGRESS.md)

## When to add an entry (mandatory)

Add an entry **in the same commit as the fix** whenever:
- the user corrects how you did something ("don't put that in the app", "that belongs in the package", "you forgot the audit event"), or
- a review, lint rule, test or `phi-review` catches something an agent wrote, or
- you notice you (or a previous agent) broke a rule in `docs/agent/*`.

Do not add: one-off typos, things only relevant to one conversation, or secrets/PHI (never paste patient data or keys here).

If the mistake already has an entry, **don't duplicate** — increment *Seen* and add the new reference.
If a rule can be enforced by a tool (lint, test, CI), add the guard and set *Guarded by*; a guarded rule is better than a remembered one.

## Entry template

```md
### LM-XXX — <short rule, imperative>
- **Seen:** <n> · <date> · <branch/PR/commit>
- **What went wrong:** <one or two sentences, concrete file paths>
- **Rule:** <what to do instead>
- **How to check:** <grep / command / lint rule that detects it>
- **Guarded by:** <lint rule / test / CI step, or "not yet — see Pxx">
```

---

## Quick rules (digest of all entries — read this if nothing else)

1. Logic, types, Zod schemas, fetch clients, icons/theme and UI components live in `packages/*`; `apps/*` only compose and wire. (LM-001)
2. Claims about MindScript must cite `docs/MindScript-How-It-Works.md`; anything not in it is "confirm", not fact. (LM-002)
3. Few hooks per component: group related state into one object / `useReducer` / react-hook-form, derive instead of syncing with effects, and render repeated fields from a config array with `.map()`. (LM-003)
4. Never keep auth tokens or user/patient profiles in `localStorage`/`sessionStorage`; signed-in areas must be guarded. (LM-004)
5. Browser code imports leaf subpaths (`@asc/validation/auth`), and a UI change is only done when the page loads in `pnpm dev` — typecheck alone does not prove it. Packages used by both browser and Node apps keep NodeNext `.js` imports and expose leaf subpaths (`@asc/authz/can`). (LM-005)
6. Only `@asc/config` reads `process.env`. (LM-006)
7. Lookup tables keyed by user/AST strings use own-property checks (`Object.hasOwn`), never `in`. (LM-007)
8. Next 16 conventions differ: `error.tsx` gets `retry` (not `reset`), `params`/`searchParams` are Promises; a Base UI `Button` rendered as a link needs `nativeButton={false}`. Check `node_modules/next/dist/docs`. (LM-008)
9. Server apps deployed to Vercel (`apps/api`) keep `typeRoots: ["./node_modules/@types"]` next to `types` in their tsconfig; don't blame the TS version without reproducing. (LM-009)
10. Deployment differences are env vars validated in `@asc/config` (listed in `turbo.json` build env), never code; a deployed build must fail rather than fall back to a localhost default. (LM-010)
11. Use leaf imports for @asc/ui in route files (src/app/**), auth, landing, and Server Components; root barrel is only for client feature components on signed-in routes. (LM-011)
12. Inside typed code, trust TypeScript union types instead of adding defensive fallback values (data from outside — API responses, URLs, storage — is still validated with Zod at the boundary); dynamic imports must be statically type-checked. (LM-012)
13. Planning/design docs: never mark an ADR `accepted` without a recorded human sign-off, write review findings into the docs they affect (not only into chat), and keep doc rewrites within the commit cap. (LM-013)
14. Authz templates: every catalog capability is held by some role, each capability comes with the data rights it needs, and tenant-wide directory data is `shared` (never facility-filtered); lint rules that inspect TypeScript must see through `as`/`!`/`satisfies`. (LM-014)
15. Finishing a phase PR: record the phase's decisions in its plan file (decisions block, not only the PR body), leave the plan checklist unticked (evidence goes in the PR), update every `.env*.example` and `docs/DEPLOYMENT_CONFIGURATION.md` for each new env var, write down rules a later migration must follow, and never let a CI run pass with skipped DB tests. (LM-015)
16. Driver errors carry data: Drizzle's "Failed query" message lists every bound parameter and Postgres puts the failing row in `DETAIL`. Database access goes through `withTenant`, which turns them into `DatabaseError` (SQLSTATE and constraint only); never log or return a raw driver error. (LM-016)
17. A guard must validate every field its spec names, and have a test per field: a typed union is not a runtime check at a boundary that takes untyped input. (LM-017)
18. Security hooks have an order, and plugin hooks do not run where you registered them: `@fastify/rate-limit` adds its hook per route, after every global hook. Call the limiter explicitly in the chain and test the order (a bad token must be counted before the identity provider is asked). (LM-018)
19. Never commit a password, not even a "dev-only" one: secret scanners (GitGuardian on every PR) flag it and every machine shares a known value. Generate local credentials per machine into a git-ignored folder, commit templates with placeholders, and add a test that fails on a literal password. A secret that reached a pushed commit stays flagged until history is rewritten or the incident is dismissed. (LM-019)
20. Compose defaults must not weaken security silently: an empty Redis `--requirepass` means no authentication, the short bind-mount syntax creates a directory where a missing file should be, and `${VAR:?}` fails unrelated commands because compose resolves every service. Keep parse-safe empty defaults and make the container itself refuse to start; use the long bind syntax with `create_host_path: false`; verify each with a real `docker compose` run, not by reading. (LM-020)
21. A builder validates relations between inputs, and an exemption keeps the rest of its rule: when two inputs form a range (start/end), check their order, not only each value; when a type is exempt from a check (shared directory data needs no facility tag), a value it does carry must still be valid. Reproduce a review claim with a throwaway test first: two of three claims on PR #56 were real, one (a trailing `-` in a regex class) was not. (LM-021)

---

## Entries

### LM-001 — Put shared code in its package, never in the app
- **Seen:** 1 · 2026-09-25 · commit `585d587` (reported by the user as a recurring agent habit, 2026-09-27; fixed in PR #9)
- **What went wrong:** An HTTP client, `ApiError` class and API payload interfaces were written in `apps/web/src/lib/api/http.ts` (with `axios` installed in `apps/web`), even though `@asc/api-client` exists for fetch logic and `@asc/types` / `@asc/validation` for types and schemas. Agents repeatedly place code in the app they are working in instead of the owning package.
- **Rule:** Before creating a file under `apps/*`, check the "where does it go" table in [implementation plan §4](docs/plan/implementation-plan.md#4-target-repository-structure-end-of-phase-1). Types → `@asc/types`, Zod → `@asc/validation`, fetch/SSE/Medplum clients and data hooks → `@asc/api-client`, rules → `@asc/clinical-rules`, FHIR builders → `@asc/fhir`, components → `@asc/ui`, LLM calls → `@asc/agents`. When the user says code is in the wrong place: move it, update imports, and add/adjust a lint guard.
- **How to check:** `grep -rnE "export (interface|type) |z\.object\(|from \"axios\"" apps/*/src`
- **Also seen:** `lucide-react` and `next-themes` imported directly in `apps/web`; a generic `KpiCard` living in `apps/web/src/components`; mock response interfaces (`DashboardDataResponse`) defined in the app.
- **Guarded by:** `@asc/eslint-config/app` (`appBoundaryConfig`) — `no-restricted-imports` (axios, zod, lucide-react, next-themes, Radix, Mantine, cmdk, `@medplum/react`, AI SDKs, pino, drizzle) and `no-restricted-syntax` (exported interfaces/type aliases and `z.*` calls in `apps/*/src`). Applied to apps/web, apps/api, apps/worker. Fixture tests: `packages/eslint-config/rules/app-boundaries.test.js`.

### LM-002 — Don't assert MindScript features without a source
- **Seen:** 1 · 2026-09-25 · product docs 01/02/05/appendix (corrected 2026-09-27, commit `cc97877`)
- **What went wrong:** Product docs stated MindScript's "Recovery Queue" was a pathology result-gap engine and that a Sign Queue and in-app fax pipeline existed. The MindScript overview shows the Recovery queue is cancelled-appointment follow-up, fax is the separate faxagnet service, and Sign Queue is not described.
- **Rule:** Cite [`docs/MindScript-How-It-Works.md`](docs/MindScript-How-It-Works.md) or MindScript source (with commit SHA) for any reuse claim; otherwise mark it *(confirm)* and add a Q-MS question in [06 §7](docs/product/06-mindscript-integration.md#7-open-questions-for-the-mindscript-team).
- **How to check:** review any diff mentioning "MindScript" for a citation or "(confirm)".
- **Guarded by:** not yet (review checklist).

### LM-003 — Don't sprawl hooks or hand-write repeated fields; use grouped state and config + `.map()`
- **Seen:** 1 · 2026-09-27 · user correction ("don't use useState/useRef/useEffect as much as they want… write a single object and iterate with map")
- **What went wrong:** `apps/web/src/components/auth/login-form.tsx` had four `useState` calls (email, password, showPassword, errors) and manual `safeParse` error mapping; `signup-persona-selector.tsx` had ~10 near-identical field blocks behind `if (role === …)` checks; the signup Zod schema repeated the same `if (!x) addIssue(...)` block per field; `@asc/ui` `useIsMobile` did `setState` inside `useEffect` for a media query.
- **Rule:** See [UI guidelines §3a](docs/agent/ui-guidelines.md#3a-hooks-state-and-config-driven-ui-clean-components). Group related state (one object / `useReducer` / react-hook-form with `setError("root")`); derive values in render; handle actions in event handlers; subscribe to external state with `useSyncExternalStore`; describe fields as `FieldConfig` data and render with `.map()` + `FormField`; put value→behaviour mappings in a `Record` instead of `if/else` chains; keep a role/field mapping once (e.g. `SIGNUP_ROLE_FIELDS`) and let both schema and form read it.
- **How to check:** `pnpm --filter web lint` / `pnpm --filter @asc/ui lint`.
- **Guarded by:** custom lint rule `asc/max-hooks-per-component` (useState ≤ 2, useEffect ≤ 1, useLayoutEffect ≤ 1, useRef ≤ 2 per function) in the Next.js and React configs, with RuleTester tests; `react-hooks/set-state-in-effect` now also runs on `@asc/ui`.

### LM-004 — Never persist auth sessions or profiles in browser storage
- **Seen:** 1 · 2026-09-25 · `apps/web/src/lib/stores/auth.store.ts` (fixed 2026-09-27, PR #9)
- **What went wrong:** The zustand store used `persist` to write the token and full user profile to `localStorage` — for the patient persona that included date of birth and escort name/phone — and it defaulted to `isAuthenticated: true` with a demo token, so the dashboard opened without signing in. There was no route guard.
- **Rule:** Session state lives in memory only; logout clears the store and the query cache; signed-in route groups are wrapped in `RequireAuth` (until P05 adds Medplum sign-in and server checks). Only non-sensitive UI preferences (theme) may use `localStorage`.
- **How to check:** after sign-in, `Object.keys(localStorage)` and `sessionStorage` contain no token/profile; opening `/dashboard` signed-out redirects to `/login`.
- **Guarded by:** not yet — add a Playwright check in P01 (`apps/web/e2e`).

### LM-005 — Verify UI changes in the running app; browser code imports leaf subpaths
- **Seen:** 2 · since commit `abaacbb` (2026-09-26), found 2026-09-27 while fixing PR #9; again 2026-10-06, PR #32 (`@asc/authz`)
- **What went wrong:** `@asc/validation`'s root entry re-exports with NodeNext `.js` specifiers (`./agents/discharge-instructions.js`). `tsc` accepts that, but Turbopack in `apps/web` cannot map `.js` back to `.ts`, so any browser import of `@asc/validation` (the login form) failed with *Module not found* and the pages returned 500. Lint, typecheck and tests were all green, so nobody noticed.
- **Rule:** Browser code (apps/web, `@asc/api-client`) imports leaf subpaths (`@asc/validation/auth`, `@asc/config/public-env`, `@asc/config/api`); packages consumed only by the browser use `moduleResolution: "bundler"` with extensionless imports (like `@asc/ui`). A UI task is done only after the page loads in `pnpm dev` (or an e2e test passes).
- **Also seen (PR #32):** `@asc/authz` was switched to `moduleResolution: "bundler"` with extensionless imports so the web app could import it, which broke `apps/api` (NodeNext) type-checking the first time the API imported it. **Rule for a package used by both browser and Node apps:** keep NodeNext and `.js` relative imports; export leaf subpaths (`@asc/authz/can`, `/grants`, `/roles`, `/workspaces`); browser code imports only leaves; a file a leaf reaches imports its siblings by leaf name (package self-reference, e.g. `@asc/authz/can`), never by relative `.js`. Only packages used by the browser alone may go extensionless.
- **How to check:** `pnpm --filter web dev` and open the changed routes; `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login` → 200.
- **Guarded by:** lint (`BROWSER_ENTRY_POINT_PATHS` in `@asc/eslint-config/app`, now including `@asc/authz`, used by the Next.js config and `@asc/api-client`); `packages/authz/src/module-format.test.ts` (NodeNext tsconfig, no relative runtime imports in leaf-reachable files); P01 Playwright smoke test will cover the rest.

### LM-006 — Only `@asc/config` reads `process.env`
- **Seen:** 2 · `packages/audit/src/index.ts` (and logger/telemetry defaults) · fixed 2026-09-27, PR #9; again 2026-10-06, `packages/db/src/__tests__/test-db.ts` (shared test helper read `TEST_DATABASE_URL`; the lint exemption covers `*.test.ts` only, so the helper takes the URL as a parameter)
- **What went wrong:** `@asc/audit` decided production mode from `process.env.NODE_ENV` itself, and logger/telemetry defaulted to `process.env`, contrary to "env is parsed once in @asc/config".
- **Rule:** Use `parseEnv()` / `publicEnv` / `getProcessEnv()` / `isProductionEnv()` from `@asc/config` (`@asc/config/runtime` for packages).
- **How to check:** `grep -rn "process\.env" packages/*/src apps/*/src | grep -v packages/config`
- **Guarded by:** `no-restricted-properties` (`process.env`) in the base ESLint config; allowed only in `packages/config` and test files.

### LM-007 — Use own-property checks for string-keyed lookups
- **Seen:** 1 · 2026-09-28 · `feat-mock-frontend` (foundation)
- **What went wrong:** `asc/max-hooks-per-component` tested `name in limits`, so any `.toString()` / `.valueOf()` call matched `Object.prototype` and was reported as "calls toString 11 times (max function toString() …)" — plain helpers (`newId`, URL builders) failed lint.
- **Rule:** When a map is keyed by arbitrary strings (AST names, user input, query params), check with `Object.hasOwn(map, key)` (or use a `Map`), never `key in map` / `map[key] !== undefined` alone.
- **How to check:** `grep -rn " in limits\| in [A-Z_]*)" packages/eslint-config`
- **Guarded by:** regression case in `packages/eslint-config/rules/max-hooks-per-component.test.js`.

### LM-008 — Check Next 16 / Base UI conventions instead of assuming older APIs
- **Seen:** 1 · 2026-09-28 · `feat-mock-frontend` (foundation, caught before commit)
- **What went wrong:** Error boundaries were about to use the Next ≤15 `reset` prop; Next 16 passes `retry` (re-fetch + re-render). A Base UI `Button` with `render={<Link />}` warns unless `nativeButton={false}`. Pages with `useSearchParams` in a prerendered tree need a `<Suspense>` boundary.
- **Rule:** Read `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/*.md` before writing a special file; use `apps/web/src/components/shell/segment-error.tsx` for every `error.tsx`; wrap `useSearchParams` readers in `<Suspense>` unless the route is dynamic.
- **How to check:** `pnpm --filter web build` (fails on missing Suspense) and the dev console for Base UI warnings.
- **Guarded by:** not yet — P01 Playwright smoke.

### LM-009 — Pin typeRoots in server tsconfigs that Vercel compiles
- **Seen:** 1 · 2026-09-30 · `worktree-fix-api-vercel-typeroots`
- **What went wrong:** Vercel deploy of `apps/api` (Fastify zero-config) failed with `TS2688: Cannot find type definition file for 'node'`, even though `@types/node` was installed. Vercel type-checks through a temp tsconfig in `/tmp` that extends `apps/api/tsconfig.json`; TypeScript 7 resolves `types: ["node"]` from `/tmp`. The agent first blamed TS 7 and suggested downgrading, but `apps/web` deploys fine on TS 7 (Next.js does not use that step).
- **Rule:** Keep `"typeRoots": ["./node_modules/@types"]` in any server tsconfig that sets `types` and is built by Vercel's Node/backend builder (relative typeRoots resolve from the declaring tsconfig). Reproduce a deploy failure locally before proposing a version change.
- **How to check:** from a dir outside the repo, `tsc --noEmit -p <tsconfig extending apps/api/tsconfig.json>` must pass.
- **Guarded by:** not yet.

### LM-010 — Never let a deployed build fall back to a localhost default
- **Seen:** 1 · 2026-09-30 · `worktree-feat-env-driven-api-url-cors`
- **What went wrong:** The first Vercel deploy of `apps/web` was built without `NEXT_PUBLIC_API_URL`, so `getPublicApiUrl()` inlined `http://localhost:4000`; with MSW off in production, visitors' browsers called their own machine and failed with a CORS error. Locally it "worked" only because MSW intercepted every request. `apps/api` also had no CORS policy.
- **Rule:** Every value that differs per environment (API URL, CORS origins, mocking) is an env var validated in `@asc/config` and listed in `turbo.json` → `tasks.build.env`. Production builds must fail on a missing value instead of using a dev default. Follow `docs/DEPLOYMENT_CONFIGURATION.md`.
- **How to check:** `env -u NEXT_PUBLIC_API_URL pnpm --filter web build` must fail with "NEXT_PUBLIC_API_URL is not set".
- **Guarded by:** `assertPublicEnvForProductionBuild` (`packages/config/src/build-env.ts`) in `apps/web/next.config.ts` + tests in `packages/config/src/env.test.ts`.

### LM-011 — Use leaf imports for @asc/ui in routes, auth, landing, and Server Components; package sideEffects
- **Seen:** 2 · 2026-10-01 · branch `perf/tree-shaking-and-mobile-css-optimization` · PR #19 (review: speculative `preload` used `void load()`, leaking an unhandled rejection when a chunk fails to load)
- **What went wrong:** Server Components in App Router (`apps/web/src/app/(auth)/layout.tsx`, `auth-brand-panel.tsx`, `brand-mark.tsx`) and unisolated pages imported components directly from the `@asc/ui` barrel. Turbopack treats barrel imports in Server Components by pulling in every `"use client"` module re-exported by that barrel, causing `SignaturePad`, `CommandPalette`, `Sheet`, etc., to leak into the `/login` and `/signup` client bundles, bloating them by >200 KB raw (>70 KB gzip). In addition, monorepo packages lacked `"sideEffects": false`, preventing effective dead-code elimination.
- **Rule:** Root `@asc/ui` is permitted in client feature components on signed-in routes. Use leaf imports in `src/app/**`, the auth tree (`src/components/auth/**`), the landing tree (`src/features/landing/**`), and Server Components (route files and anything they import directly, without a use client file in between). Monorepo packages declare `"sideEffects": false` in their `package.json` (`@asc/ui` declares `"sideEffects": ["**/*.css"]`). Heavy workflow panels (case tabs, command menus, tour dialogs) must be loaded dynamically via `next/dynamic` (`ssr: false` when client-only overlays/modals triggered on demand; default SSR with `<LoadingSkeleton variant="detail" />` for workflow tabs). Speculative preloads (hover/focus) attach `.catch(() => undefined)` — never `void load()` — so a failed prefetch does not raise `unhandledrejection`; the render path through `dynamic` surfaces real load errors.
- **How to check:** `pnpm lint` catches root `@asc/ui` imports in routes, auth, and landing; `pnpm --filter web test:bundles` verifies that prerendered routes stay within `perf-budget.json`, forbidden strings fail on barrel leaks, and `/cases/[caseId]` starting entry chunks from `.next/server/app/(dashboard)/cases/[caseId]/page_client-reference-manifest.js` stay within `dynamicBudgetsKbGz` in `perf-budget.json` and omit case workspace tab content (`"Retroflexion in rectum"`).
- **Guarded by:** `apps/web/perf/perf-budget.json`, `apps/web/perf/bundles.test.ts` (prerender budgets + dynamic page client manifest test for `/cases/[caseId]`), and ESLint `no-restricted-imports` on `@asc/ui` (`packages/eslint-config/app.js`).

### LM-012 — Don't defeat static TypeScript guarantees with defensive fallback values or string-keyed dynamic imports
- **Seen:** 1 · 2026-10-01 · branch `perf/tree-shaking-and-mobile-css-optimization` · PR #19
- **What went wrong:** In `demo-login-bar.tsx`, an unnecessary fallback `PERSONAS[preset.role] ?? PERSONAS.ADMIN` was added even though `preset.role` was already an exhaustive `UserRole` union; this bypassed the type checker and would silently mislabel users. In `case-tabs.ts`, `lazyTab(importer, exportName: string)` with `mod[exportName] as ComponentType` bypassed compile-time verification, allowing typos in export names to pass type check and crash at runtime.
- **Rule:** Trust TypeScript union types—do not add silent fallbacks that hide type mismatches or misattribute roles. Dynamic imports must be type-checked at compile-time (e.g. `lazyTab(() => import(...).then((m) => m.ExportName))`) rather than looking up export strings with unvalidated casts.
- **How to check:** `pnpm check-types` and code review.
- **Guarded by:** string-keyed imports: `pnpm check-types` via the type-safe `lazyTab` signature. Fallbacks on exhaustive types: not yet, code review only (`@typescript-eslint/no-unnecessary-condition` would catch them but flags 45 existing sites in `apps/web`; enable it in a follow-up).

### LM-013 — Design/plan rewrites: no self-ratified ADRs, findings go into docs, commits stay small
- **Seen:** 1 · 2026-10-05 · branch `worktree-iam-implementation-plan` · PR #21
- **What went wrong:** An agent consolidating the IAM plan (1) flipped `docs/decisions/2026-10-03-medplum-as-identity-and-access-platform.md` to `accepted` with no recorded sign-off while 08 §15 still had open questions; (2) reported Medplum's unsafe defaults (`registerEnabled: true`, `saveAuditEvents: false`, `storeBotInput: true`) only in chat, so no checklist enforced them; (3) committed the whole rewrite as one 26-file, +510/−1655 commit; (4) left `Principal` in 08 §6.1 with a flat capability set that contradicted the per-facility-grants correction it claimed to keep.
- **Rule:** ADR status changes to `accepted` only with the decision-maker's name and date in the front matter. Review findings that change what must be built go into the phase checklist and design doc in the same change. Doc rewrites follow [incremental-commits §4](docs/agent/incremental-commits.md#4-size-limits-and-commit-shape) like code. After a rewrite, grep the design doc for every type or rule the plan says it preserves.
- **How to check:** `git show --stat` per commit (≤ 400 changed lines); `grep -n "status:" docs/decisions/*.md` against recorded sign-offs; link + anchor check over changed docs.
- **Guarded by:** not yet — review only. A docs link/anchor check in CI (P01) would catch the broken references.

### LM-014 — Authz templates: no orphan capabilities, matching data rights, shared data not facility-filtered
- **Seen:** 1 · 2026-10-06 · PRs #25 and #29 (found in review)
- **What went wrong:** The first P05b templates left 11 catalog capabilities (`timeout.participate`, `note.addend`, …) held by no role, gave `admin` no `case.read`, and had no data rights for resources a capability needs (a capability without Medplum access is refused at gate 5). The P05c compiler then put `_compartment=%facility` on every resource, including `Practitioner`, `Organization` and `Location`, which carry no facility tag, so facility-scoped staff would have seen no doctors or rooms (only visible in P05h against real Medplum). The role-name lint rule also missed comparisons wrapped in `as const` or `!`.
- **Rule:** When adding or changing a role template, assign every capability to at least one role, list the FHIR resource types each capability reads or writes, and mark tenant-wide directory data `shared` so the compiler skips the facility filter. Check a compiled policy for what a role can still *see*, not only for what it is denied. Lint rules over TypeScript unwrap `TSAsExpression`, `TSNonNullExpression`, `TSSatisfiesExpression` and `TSTypeAssertion`.
- **How to check:** `pnpm --filter @asc/authz test` (orphan test, directory-data test, matrix and policy snapshots); review the snapshot diff for widened or hidden resources.
- **Guarded by:** `packages/authz/src/roles/matrix.test.ts` (no orphans, all capabilities documented), `policy/snapshot.test.ts` (directory data never facility-filtered), `eslint-config/rules/no-role-name-comparison.test.js` (TypeScript wrappers). Real-Medplum check: P05h policy test.

### LM-015 — Phase PRs: decisions in the plan, unticked checklist, env examples, no silent skips
- **Seen:** 1 · 2026-10-06 · PR #36 (P05e), found in review
- **What went wrong:** P05e left its decisions only in the PR body and `@asc/db` README (the P05d decisions block in the P05 plan was the standard), ticked the plan checklist (P05a–P05d are left unticked on purpose, evidence lives in the PR), added `DATABASE_RUNTIME_URL`, `DEFAULT_TENANT_ID` and `MEDPLUM_PROJECT_ID` to `@asc/config` without touching `apps/*/.env*.example` or `docs/DEPLOYMENT_CONFIGURATION.md`, let 49 DB tests skip silently (green without a database, so CI would never run the RLS tests), and never wrote down that FORCE row-level security also applies to the table owner, so a later owner-side migration or job needs `app.tenant_id` set.
- **Rule:** When closing a phase: add a "Pxx decisions" block to its plan file (include rules later migrations must follow); do not tick the plan checklist; add every new env var to the four `.env*.example` files of each app that parses it and to `docs/DEPLOYMENT_CONFIGURATION.md` (extends LM-010); a suite that can skip needs a CI guard that fails when the prerequisite is missing.
- **How to check:** `git diff --stat origin/main -- packages/config apps/*/.env* docs/DEPLOYMENT_CONFIGURATION.md` together; `grep -c "\[x\]" docs/plan/phases/P05-auth-roles.md`; `CI=true pnpm --filter @asc/db test` without a database must fail.
- **Guarded by:** `packages/db/src/__tests__/require-db-in-ci.test.ts` (skips only). The rest: not yet, review only.

### LM-016 — Never surface a raw database driver error: it contains the bound values
- **Seen:** 1 · 2026-10-06 · found in P05f while testing a failing audit insert (the P05e run store had the same exposure); the first fix matched on the shape of `error.code` and was corrected in review (PR #38)
- **What went wrong:** `withTenant` (P05e) let Drizzle's `DrizzleQueryError` escape. Its message is `Failed query: <sql> params: <every bound value>`; for `agent_runs.succeed` the parameters include `output` (model output, PHI), for `audit_events` the event details and ids. Anything that logs or returns `error.message` (a Fastify error handler, `logger.error({ err })`, a BullMQ `failedReason`) would have written PHI to a non-PHI sink. Postgres also puts the failing row in the error's `DETAIL`.
- **Rule:** All app database access goes through `withTenant`, which converts driver failures to `DatabaseError` (SQLSTATE and constraint name only). Do not read `error.cause`, `error.params` or `error.detail`, and do not add a code path that talks to the database without `withTenant`. Recognise driver errors by class (`DrizzleQueryError`, `postgres.PostgresError`), never by the shape of `code`: Node system errors such as `EPIPE` and `EBUSY` are also five uppercase characters.
- **How to check:** `pnpm --filter @asc/db test` (`db-error.test.ts`, and the canary assertions in `audit-store.test.ts`); grep for `.cause` and `.params` in code that handles database errors.
- **Guarded by:** `packages/db/src/db-error.test.ts` and `audit-store.test.ts` (canary strings must not appear in the error). Raw clients outside `withTenant` are not covered: the owner client lives in `@asc/db/migrate` for migrations only.

### LM-017 — A validator covers every field its spec names, with a test for each
- **Seen:** 1 · 2026-10-06 · PR #38 (P05f), found in review
- **What went wrong:** The P05f decision said `decision.roleVersions`, `catalogVersion` and `cache` must be short identifiers or rejected, but `sanitizeDecision` checked only the first two. The `cache` field was protected by its TypeScript union alone, so a value from an adapter result or JSON would have been written to the audit table unchecked. The tests covered the two checked fields and never tried a bad `cache`.
- **Rule:** When a guard exists to keep free text out of a PHI-free store, list the fields from the spec and validate each at runtime (allowed set for enums, token pattern for ids), then add a rejecting test and a production-drops test per field. Types protect typed callers only (LM-012 is about not adding fallbacks inside typed code, not about skipping validation where untyped data arrives).
- **How to check:** `pnpm --filter @asc/audit test` (`decision.test.ts` has a case per field); compare the spec's field list with the validator.
- **Guarded by:** `packages/audit/src/decision.test.ts` (one rejecting case per decision field).

### LM-018 — Security hooks run in a specific order: test it, do not assume it
- **Seen:** 1 · 2026-10-07 · P05g, found by an attack test (`tampering.test.ts`) before the PR
- **What went wrong:** The API registered `@fastify/rate-limit` before the authentication hook and assumed the limit therefore ran first. The plugin attaches its limit to each route's own `onRequest` list, which Fastify runs after all global hooks. Authentication answered every bad token with 401 before the limit counted anything: five wrong tokens, five 401s, no 429, and the identity provider was asked every time. The health route (public, no authentication hook) hid it, because there the limit did run.
- **Rule:** Build the request pipeline as explicit global hooks in one place (`app.ts`): tenant, flood limit, authentication, authorization. Use `app.createRateLimit(...)` inside your own hook rather than the plugin's automatic hook. Every ordering claim gets a test that fails if the order changes (here: failed authentications are counted and the provider is not asked after the limit).
- **How to check:** `pnpm --filter api test` (`tampering.test.ts` > "counts failed authentications"); read the hook order in `apps/api/src/app.ts`.
- **Guarded by:** `apps/api/src/auth/tampering.test.ts`.

### LM-019 — No committed passwords, even dev-only ones: generate them per machine
- **Seen:** 1 · 2026-10-07 · PR #42 (P02), GitGuardian check failed
- **What went wrong:** The local Medplum stack shipped a "dev-only" password as a literal in `docker-compose.yml` (`POSTGRES_PASSWORD`), in `infra/medplum/medplum.config.local.json` (database, Redis and super admin) and as the default of `seedEnvSchema`. GitGuardian reported two findings (a generic password and a username/password pair) and failed the PR check. Besides the scanner, every developer's machine shared the same known super admin password, and the docs called it "harmless" because it only listens on localhost.
- **Rule:** No password literal in the repo. A local stack gets random credentials generated per machine into a git-ignored folder (`infra/medplum/.local/`), a committed template holds placeholders, compose reads variables (`--env-file`), and nothing may default a password. Generate once and keep them if a volume already stores them, and refuse a damaged file instead of regenerating. A secret that already reached a pushed commit stays flagged by the scanner for that commit: removing it in a later commit is not enough (rewrite the history of an unmerged branch into a new PR, or dismiss the incident in the scanner's dashboard).
- **How to check:** `grep -rniE "password\"?\s*[:=]\s*\"?[a-z0-9-]{6,}" --exclude-dir=node_modules . | grep -v placeholder`; `pnpm --filter bots test` (`local-credentials.test.ts` > "no committed credentials").
- **Guarded by:** `apps/bots/scripts/lib/local-credentials.test.ts` (template placeholders only, no literal password in the Medplum part of the compose file); the GitGuardian PR check. Other apps and env examples are not covered by a test.

### LM-020 — Compose defaults must fail fast, not fail open (or break other commands)
- **Seen:** 1 · 2026-10-07 · PR #43 (P02), found in review and reproduced
- **What went wrong:** The local Medplum compose file (1) defaulted the Redis password to an empty string: started without `--env-file`, `--requirepass ""` runs Redis with **no authentication** (a bare `PING` returned `PONG`); (2) mounted the generated config with the short bind syntax, so starting compose before `pnpm medplum:up` made Docker create a **directory** at the file's path and the next render crashed with `EISDIR`; (3) `medplum:down` required the generated env file and failed after the documented reset; (4) a damaged `credentials.json` surfaced a raw `SyntaxError`. The reviewer's suggested fix for (1), `${VAR:?}`, would have made `docker compose config`, `stop` and `pnpm db:up` fail too (compose resolves every service, active profile or not).
- **Rule:** Keep empty, parse-safe defaults for variables that only some services need, and have the *container* refuse to start without them (a `test -n` guard in its command; Postgres already refuses). Mount generated files with the long syntax and `create_host_path: false`. Commands that only stop things must not need credentials. Turn every file read of generated state into one friendly error. Check each of these by running compose, in an isolated copy (own project name, no fixed container names or ports) so a running stack is not touched.
- **How to check:** `pnpm --filter bots test` (`local-credentials.test.ts`: compose guards, root scripts, damaged files; `esbuild-config.test.ts`).
- **Guarded by:** those tests pin the compose text and root scripts; the runtime behaviour was verified by hand with compose.

### LM-021 — Validate input relations and keep the rest of a rule for exempt cases
- **Seen:** 1 · 2026-10-08 · PR #56 (P03), found in review and reproduced
- **What went wrong:** `buildCaseEncounter` checked `start` and `end` one at a time, so `end` before `start` produced an invalid FHIR Period without an error, while `buildAppointment` already checked the order. `createTransaction` exempted tenant-wide directory types (Location, Practitioner, ...) from the facility check entirely, so a `Location` tagged with another facility's `meta.account` was accepted in this facility's transaction.
- **Rule:** When inputs form a pair (start/end, from/to), validate the relation as well as each value, in every builder that takes the pair, and use one rule (a FHIR Period may not end before it starts; equal is allowed). When a check has an exemption, keep the weaker form of the check for the exempt case (no tag needed, but a tag that is present must match). Before changing code for a review claim, reproduce it; one claim on this PR (a trailing `-` in the id character class) was checked and was not a defect.
- **How to check:** `pnpm --filter @asc/fhir test` ("refuses a period that ends before it starts", "refuses one tagged for another").
- **Guarded by:** those tests, and the 100 % coverage gate of `@asc/fhir` (a new branch without a test fails `pnpm test`).

### LM-022 — Check the pinned library's types for deprecations before building on a field
- **Seen:** 1 · 2026-10-08 · PR #56 (P03), found in an architecture review
- **What went wrong:** `facilityMeta()` stamped the singular `meta.account`, copied from the P05h spikes. `@medplum/fhirtypes` 5.1.42 (the pinned version) marks it `@deprecated Use Meta.accounts instead`, and the plural field is what lets a resource (a Patient seen at two facilities) belong to more than one facility. Every builder, and every stored resource, would have needed a migration later.
- **Rule:** Before a field is written into every stored resource, read its definition in the pinned type package and prefer the non-deprecated form. Prove the replacement enforces the same way against the live server before switching.
- **How to check:** `pnpm --filter @asc/fhir test` ("never writes the deprecated singular meta.account", "refuses the deprecated meta.account ..."); `pnpm --filter bots test:medplum` (`s1-accounts.live.ts`).
- **Guarded by:** the `@asc/fhir` source test and the live spike.
