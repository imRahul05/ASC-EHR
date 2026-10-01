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
5. Browser code imports leaf subpaths (`@asc/validation/auth`), and a UI change is only done when the page loads in `pnpm dev` — typecheck alone does not prove it. (LM-005)
6. Only `@asc/config` reads `process.env`. (LM-006)
7. Lookup tables keyed by user/AST strings use own-property checks (`Object.hasOwn`), never `in`. (LM-007)
8. Next 16 conventions differ: `error.tsx` gets `retry` (not `reset`), `params`/`searchParams` are Promises; a Base UI `Button` rendered as a link needs `nativeButton={false}`. Check `node_modules/next/dist/docs`. (LM-008)
9. Server apps deployed to Vercel (`apps/api`) keep `typeRoots: ["./node_modules/@types"]` next to `types` in their tsconfig; don't blame the TS version without reproducing. (LM-009)
10. Deployment differences are env vars validated in `@asc/config` (listed in `turbo.json` build env), never code; a deployed build must fail rather than fall back to a localhost default. (LM-010)
11. Use leaf imports for @asc/ui in route files (src/app/**), auth, landing, and Server Components; root barrel is only for client feature components on signed-in routes. (LM-011)
12. Inside typed code, trust TypeScript union types instead of adding defensive fallback values (data from outside — API responses, URLs, storage — is still validated with Zod at the boundary); dynamic imports must be statically type-checked. (LM-012)

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
- **Seen:** 1 · since commit `abaacbb` (2026-09-26), found 2026-09-27 while fixing PR #9
- **What went wrong:** `@asc/validation`'s root entry re-exports with NodeNext `.js` specifiers (`./agents/discharge-instructions.js`). `tsc` accepts that, but Turbopack in `apps/web` cannot map `.js` back to `.ts`, so any browser import of `@asc/validation` (the login form) failed with *Module not found* and the pages returned 500. Lint, typecheck and tests were all green, so nobody noticed.
- **Rule:** Browser code (apps/web, `@asc/api-client`) imports leaf subpaths (`@asc/validation/auth`, `@asc/config/public-env`, `@asc/config/api`); packages consumed only by the browser use `moduleResolution: "bundler"` with extensionless imports (like `@asc/ui`). A UI task is done only after the page loads in `pnpm dev` (or an e2e test passes).
- **How to check:** `pnpm --filter web dev` and open the changed routes; `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login` → 200.
- **Guarded by:** lint (`BROWSER_ENTRY_POINT_PATHS` in `@asc/eslint-config/app`, used by the Next.js config and `@asc/api-client`); P01 Playwright smoke test will cover the rest.

### LM-006 — Only `@asc/config` reads `process.env`
- **Seen:** 1 · `packages/audit/src/index.ts` (and logger/telemetry defaults) · fixed 2026-09-27, PR #9
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
- **Seen:** 1 · 2026-10-01 · branch `perf/tree-shaking-and-mobile-css-optimization` · PR #19
- **What went wrong:** Server Components in App Router (`apps/web/src/app/(auth)/layout.tsx`, `auth-brand-panel.tsx`, `brand-mark.tsx`) and unisolated pages imported components directly from the `@asc/ui` barrel. Turbopack treats barrel imports in Server Components by pulling in every `"use client"` module re-exported by that barrel, causing `SignaturePad`, `CommandPalette`, `Sheet`, etc., to leak into the `/login` and `/signup` client bundles, bloating them by >200 KB raw (>70 KB gzip). In addition, monorepo packages lacked `"sideEffects": false`, preventing effective dead-code elimination.
- **Rule:** Root `@asc/ui` is permitted in client feature components on signed-in routes. Use leaf imports in `src/app/**`, the auth tree (`src/components/auth/**`), the landing tree (`src/features/landing/**`), and Server Components (route files and anything they import directly, without a use client file in between). Monorepo packages declare `"sideEffects": false` in their `package.json` (`@asc/ui` declares `"sideEffects": ["**/*.css"]`). Heavy workflow panels (case tabs, command menus, tour dialogs) must be loaded dynamically via `next/dynamic` (`ssr: false` when client-only overlays/modals triggered on demand; default SSR with `<LoadingSkeleton variant="detail" />` for workflow tabs).
- **How to check:** `pnpm lint` catches root `@asc/ui` imports in routes, auth, and landing; `pnpm --filter web test:bundles` verifies that prerendered routes stay within `perf-budget.json`, forbidden strings fail on barrel leaks, and `/cases/[caseId]` starting entry chunks from `.next/server/app/(dashboard)/cases/[caseId]/page_client-reference-manifest.js` stay within `dynamicBudgetsKbGz` in `perf-budget.json` and omit case workspace tab content (`"Retroflexion in rectum"`).
- **Guarded by:** `apps/web/perf/perf-budget.json`, `apps/web/perf/bundles.test.ts` (prerender budgets + dynamic page client manifest test for `/cases/[caseId]`), and ESLint `no-restricted-imports` on `@asc/ui` (`packages/eslint-config/app.js`).

### LM-012 — Don't defeat static TypeScript guarantees with defensive fallback values or string-keyed dynamic imports
- **Seen:** 1 · 2026-10-01 · branch `perf/tree-shaking-and-mobile-css-optimization` · PR #19
- **What went wrong:** In `demo-login-bar.tsx`, an unnecessary fallback `PERSONAS[preset.role] ?? PERSONAS.ADMIN` was added even though `preset.role` was already an exhaustive `UserRole` union; this bypassed the type checker and would silently mislabel users. In `case-tabs.ts`, `lazyTab(importer, exportName: string)` with `mod[exportName] as ComponentType` bypassed compile-time verification, allowing typos in export names to pass type check and crash at runtime.
- **Rule:** Trust TypeScript union types—do not add silent fallbacks that hide type mismatches or misattribute roles. Dynamic imports must be type-checked at compile-time (e.g. `lazyTab(() => import(...).then((m) => m.ExportName))`) rather than looking up export strings with unvalidated casts.
- **How to check:** `pnpm check-types` and code review.
- **Guarded by:** string-keyed imports: `pnpm check-types` via the type-safe `lazyTab` signature. Fallbacks on exhaustive types: not yet, code review only (`@typescript-eslint/no-unnecessary-condition` would catch them but flags 45 existing sites in `apps/web`; enable it in a follow-up).
