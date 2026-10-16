# Plan 02 — Review, fix and rebase PR #105 (`P18` intra-op, timeout, Gate 2, scope lock)

> **Branch:** `feat/p18-intraop-timeout-and-gate2`
> **Status:** The automated review of #105 **did not finish** (the reviewer hit its quota). Run this checklist as the review: the executing agent works through every item and fixes any failure.
> **Do this AFTER PR #104 is merged.**

## Step 1 — Rebase on main (after #104 merges)
```bash
git checkout feat/p18-intraop-timeout-and-gate2
git fetch origin && git rebase origin/main
```
Expected conflicts and how to resolve them (keep **both** sides every time):

| File | Resolution |
|---|---|
| `PROGRESS.md` | Keep the P01/P12 rows and the P18 row, plus both Done-log entries. |
| `apps/web/perf/perf-budget.json` | Keep `/worklist` (budgetsKbGz) **and** `/cases/[caseId]` (dynamicBudgetsKbGz). |
| `packages/clinical-rules/package.json` + `src/index.ts` | Keep the `./worklist/*` and `./scope-lock` exports. |
| `packages/validation/package.json` + `src/index.ts` | Keep `./worklist.schema` and `./procedure-capture`. |
| `packages/api-client/src/react/hooks.ts` | Keep both sets of imports and hooks. |

After the rebase, apply the Plan 01 lesson: if P18 routes use idempotency, confirm the scope key includes `caseId` (it does through `clinicalMutationRoute`).

## Step 2 — Review checklist (fix every ❌)
**Contracts**
- [ ] `TimeOutChecklist` has the 3 new optional confirmations. `TimeOutRecord` has `participants` and `fhirObservationId`.
- [ ] `PROCEDURE_EVENT_TYPES` includes `ROOM_IN` and `ROOM_OUT`. Every exhaustive `switch` / `Record<ProcedureEventType,…>` is updated (`grep -rn "ProcedureEventType" apps packages`).
- [ ] `ScopeAssignmentRecord`, `Gate2OverrideRecord` and the optional `CaseDetail.scopeAssignment` / `gate2Override` fields exist.
- [ ] `packages/validation/src/procedure-capture.ts` is exported in `package.json` and `index.ts`, and is tested.

**Rules (pure, cited)**
- [ ] `scope-lock.ts`: leak PASS, cycle PASS, `<=168h`, rejects future timestamps, `overridable: false` always. Boundary tests at 167.9 / 168.0 / 168.1.
- [ ] `evaluateGate2WithOverride` refuses when `hasActiveScopeLockViolation`. It allows only `gi-physician` / `anesthesia` with a reason of at least 10 characters.
- [ ] `evaluateWithdrawalQuality` returns null-safe results against the 6-minute benchmark.
- [ ] JSDoc cites Joint Commission UP.01.03.01, ASGE 2022 QI, ASGE/SGNA/AAMI ST91 and CMS 42 CFR §416.52.

**FHIR**
- [ ] `builders/procedure-capture.ts` is exported, and build→parse round-trips for all 5 observation kinds. LOINC/extension constants are not duplicated with existing `urls.ts` / `extensions.ts` keys.

**API**
- [ ] All 4 routes use `clinicalMutationRoute` (capability → idempotency → If-Match → case → body).
- [ ] 409 `GATE_FAILED` for: SCOPE_IN/SEDATION_START before the timeout, SCOPE_IN without a verified scope, a scope over 168h, and an override attempted while the scope lock is active.
- [ ] 403 when a role other than gi-physician/anesthesia attempts the override.
- [ ] SCOPE_OUT after CECUM_REACHED writes a withdrawal-time Observation.
- [ ] `case-read-service.ts` hydrates `events`, `timeOut`, `scopeAssignment` and `gate2Override` (it no longer returns the hard-coded `events: []`).
- [ ] Tenant isolation: every Observation search is filtered by facility (`forFacility`).

**Client / Web / MSW**
- [ ] `useRecordProcedureEvent` is optimistic: it rolls back on error and invalidates on settle.
- [ ] Every component passes `asc/max-hooks-per-component` (`pnpm --filter web lint`).
- [ ] Leaf imports only (`@asc/clinical-rules/scope-lock`, etc.). No root barrel imports in `apps/web`.
- [ ] MSW enforces the same 409/403 rules and error codes as Fastify (`LM-006`).
- [ ] No `any` / `unknown`: `grep -rnE "\bany\b|unknown" $(git diff --name-only origin/main -- '*.ts' '*.tsx')`.
- [ ] `/cases/[caseId]` bundle budget increase is justified. Lazy-load `ScopeAssignmentCard` and `Gate2OverrideBar` with `next/dynamic` if they are over budget.

## Step 3 — Verify and merge
```bash
pnpm check-types && pnpm lint && pnpm test && pnpm eval && pnpm build && pnpm --filter web test:bundles
```
Update the `P18` row in `PROGRESS.md` to `done`, with the PR number. Add a `LEARNING_MISTAKES.md` entry for any defect you fixed.
