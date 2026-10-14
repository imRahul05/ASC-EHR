# Phase 2 Streamlining, Single-Facility Auth & P15c Case Workspace Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Streamline the ASC EHR codebase for Day-1 single-facility operations (unmount dormant Phase 2 UI routes, auto-resolve `facilityId`, simplify database session hooks while preserving `facility_id` and all code), implement live P15c backend APIs (`GET /schedule`, `GET /cases/:id`, `POST /cases/:id/transition`), and achieve 100% lockstep parity between the live API and MSW mocks.

**Architecture:** Operates as a single-specialty GI ASC (Place of Service 24). Preserves `facility_id` on all database tables and FHIR `meta.accounts` for Phase 2 multi-site growth while removing runtime Postgres RLS session hooks. Unmounts dormant Phase 2 screens from Next.js 16 App Router (excluding them from build bundles without deleting files), while maintaining MSW mock handlers in lockstep with Fastify 5 endpoints.

**Tech Stack:** Fastify 5, Next.js 16 App Router, Medplum 5.1.42 (FHIR R4 & IdP), PostgreSQL (Drizzle ORM), TanStack Query v5, Zustand, MSW, Vitest.

**Spec:** `docs/plan/phases/P15c-case-workspace-api.md` · `docs/decisions/2026-10-14-single-facility-progressive-mounting-and-mock-alignment.md` · `scratch/requirements_document.md` · `scratch/build_specification.md`

---

## Global Constraints

- Absolute ban on `any` and `unknown` types across all packages (strict TypeScript).
- No code deletions of Phase 2 features: preserve all components in `apps/web/src/features/portal/` and `apps/web/src/features/guide/`.
- Every database row and FHIR resource MUST retain `facility_id` and `meta.accounts = ["Organization/<facilityId>"]`.
- Commits must be atomic, ≤ 400 changed lines, with conventional commit messages (`feat:`, `fix:`, `refactor:`, `test:`).
- Mocks and live endpoints must remain in strict lockstep parity.

---

## Review Focus

1. **`facilityId` Null Trap:** Signing in with global scope must immediately resolve the default facility context so booking buttons are never disabled on mount.
2. **Missing Stage Transition Timestamp:** Case transitions without `phaseEnteredAt` must not trap procedure rooms in permanent turnover.
3. **Date-Bounded Schedule Queries:** Schedule searches must be strictly date-bounded (`ge${startOfDay}` and `le${endOfDay}`) to prevent unbounded queries.
4. **Unmounted Route Tree-Shaking:** Ensure unmounting `/my-care` produces zero TypeScript errors and compiles cleanly without bundling unneeded portal assets.
5. **MSW vs. Live API Contract Mismatch:** Ensure response shapes for `GET /cases/:id` and `GET /schedule` in `apps/api` match `apps/web/src/mocks/handlers/` byte-for-byte.

---

## Sub-Agent Dependency Matrix

```mermaid
flowchart TD
    subgraph StreamA ["Track A: Frontend Streamlining & Single-Facility Auth (Sub-agent 1)"]
        T1["Task 1: Auto-Default Facility Context (auth.store.ts & navbar)"]
        T2["Task 2: Unmount Dormant Phase 2 Routes (/my-care & tour overlays)"]
        T1 --> T2
    end

    subgraph StreamB ["Track B: Database & Backend Core (Sub-agent 2)"]
        T3["Task 3: Streamline @asc/db Access (Remove withTenant RLS hook)"]
        T4["Task 4: Implement GET /schedule in Fastify"]
        T5["Task 5: Implement GET /cases/:id & POST /cases/:id/transition in Fastify"]
        T3 --> T4
        T3 --> T5
    end

    subgraph StreamC ["Track C: Integration & Mock Lockstep (Sub-agent 3)"]
        T6["Task 6: Wire Case Workspace & Schedule to Live API Client"]
        T7["Task 7: Align MSW Mock Handlers & Lockstep Verification"]
        T6 --> T7
    end

    subgraph StreamD ["Track D: Verification & Gate Review (Sub-agent 4)"]
        T8["Task 8: Full Monorepo Typecheck, Lint & Integration Test Gate"]
    end

    StreamA --> StreamC
    StreamB --> StreamC
    StreamC --> StreamD
```

| Task | Track | Dependencies | Parallel Execution | Role | Output Files |
|---|---|---|---|---|---|
| **T1** | Frontend Auth | None | Parallel with T3, T4, T5 | UI Systems Engineer | `apps/web/src/lib/stores/auth.store.ts`, `apps/web/src/components/shell/` |
| **T2** | Route Streamlining | T1 | Parallel with T4, T5 | Frontend Engineer | `apps/web/src/app/(dashboard)/`, `apps/web/src/components/shell/nav-config.ts` |
| **T3** | DB Simplification | None | Parallel with T1, T2 | Database Architect | `packages/db/src/tenant.ts`, `packages/db/src/audit-store.ts` |
| **T4** | Schedule API | T3 | Parallel with T1, T2, T5 | Backend API Engineer | `apps/api/src/routes/schedule.ts`, `apps/api/src/routes/schedule.test.ts` |
| **T5** | Case Lifecycle API | T3 | Parallel with T1, T2, T4 | Clinical Backend Engineer | `apps/api/src/routes/cases.ts`, `apps/api/src/routes/cases.test.ts` |
| **T6** | Frontend Wiring | T1, T4, T5 | Sequential after APIs | Fullstack Integrator | `packages/api-client/src/cases.ts`, `apps/web/src/features/case/` |
| **T7** | Mock Lockstep | T6 | Sequential after wiring | QA & Mock Engineer | `apps/web/src/mocks/handlers/cases.ts`, `apps/web/src/mocks/handlers/schedule.ts` |
| **T8** | Verification Gate | T2, T7 | Final gate | Security & QA Reviewer | Turborepo lint, check-types, test suites passing 100% |

---

## Detailed Task Specifications

### Task 1: Auto-Default Facility Context on Login
**Files:**
- Modify: `apps/web/src/lib/stores/auth.store.ts`
- Modify: `apps/web/src/components/shell/app-header.tsx`
- Test: `apps/web/src/lib/stores/auth.store.test.ts`

- [ ] **Step 1: Write failing test for auto-defaulting facility ID**
  Verify that when an admin user logs in with multiple facilities or scope `"all"`, `authStore.getState().facilityId` automatically defaults to the primary facility (`Organization/default` or `facilities[0].id`), and is never `null`.
- [ ] **Step 2: Run test to verify failure**
  Run: `pnpm --filter @asc/web test auth.store.test.ts`
- [ ] **Step 3: Implement auto-default logic in `auth.store.ts`**
  Ensure `setAuthSession` selects `facilities[0]?.id ?? "default-facility"` if `facilityId` is not explicitly set.
- [ ] **Step 4: Hide manual `FacilitySwitcher` when single facility exists**
  In `app-header.tsx`, render `FacilitySwitcher` only when `facilities.length > 1`.
- [ ] **Step 5: Verify test passes and commit**
  Commit: `fix(web): auto-default facility context on sign-in and streamline header`

---

### Task 2: Unmount Dormant Phase 2 Routes
**Files:**
- Move: `apps/web/src/app/(dashboard)/my-care/page.tsx` -> `apps/web/src/app/(dashboard)/_my-care/page.tsx`
- Modify: `apps/web/src/components/shell/nav-config.ts`
- Modify: `apps/web/src/lib/workspaces.ts`
- Modify: `apps/web/src/lib/personas.ts`
- Test: `apps/web/src/components/shell/nav-config.test.ts`

- [ ] **Step 1: Write failing test in `nav-config.test.ts`**
  Assert that navigation items for clinical staff do not include `/my-care` or portal self-read links.
- [ ] **Step 2: Run test to verify failure**
  Run: `pnpm --filter @asc/web test nav-config.test.ts`
- [ ] **Step 3: Unmount route and navigation links**
  Prefix the directory with underscore `_my-care` so Next.js ignores it. Remove `my-care` entries from `NAV_ITEMS` and `workspaces.ts`. Remove `demo-patient` from `PERSONAS`.
- [ ] **Step 4: Verify test passes and build succeeds**
  Run: `pnpm --filter @asc/web test && pnpm --filter @asc/web check-types`
- [ ] **Step 5: Commit**
  Commit: `refactor(web): unmount dormant patient portal routes while preserving features`

---

### Task 3: Streamline `@asc/db` (Remove `withTenant` RLS Session Hook)
**Files:**
- Modify: `packages/db/src/tenant.ts`
- Modify: `packages/db/src/audit-store.ts`
- Test: `packages/db/src/tenant.test.ts`

- [ ] **Step 1: Write test verifying direct parameterized queries**
  Ensure database queries execute directly using standard Drizzle transactions without invoking `SELECT set_config('app.tenant_id', ...)`.
- [ ] **Step 2: Run test to verify behavior**
  Run: `pnpm --filter @asc/db test`
- [ ] **Step 3: Update `tenant.ts` to export direct query interface**
  Preserve `tenant_id` and `facility_id` columns in schemas, but allow `withTenant` to execute without the Postgres session hook.
- [ ] **Step 4: Update `audit-store.ts` to default `facility_id` / `tenant_id` without throwing `AuditTenantMissingError`**
- [ ] **Step 5: Run tests and commit**
  Commit: `refactor(db): streamline query execution removing connection-pinned session hooks`

---

### Task 4: Implement `GET /schedule` in Fastify (`apps/api`)
**Files:**
- Create: `apps/api/src/routes/schedule.ts`
- Test: `apps/api/src/routes/schedule.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write failing integration test for `GET /schedule`**
  Verify `GET /schedule?date=2026-10-14&facilityId=org-1` returns HTTP 200 with date-bounded appointments and encounters.
- [ ] **Step 2: Run test to verify failure**
  Run: `pnpm --filter @asc/api test schedule.test.ts`
- [ ] **Step 3: Implement `GET /schedule` handler**
  Query Medplum for Appointments with date bounds (`ge${startOfDayIso}`, `le${endOfDayIso}`) and resolve associated patient displays and procedure names using shared defaults from `@asc/clinical-rules`.
- [ ] **Step 4: Run test to verify pass**
  Run: `pnpm --filter @asc/api test schedule.test.ts`
- [ ] **Step 5: Commit**
  Commit: `feat(api): implement date-bounded GET /schedule endpoint`

---

### Task 5: Implement `GET /cases/:id` and `POST /cases/:id/transition`
**Files:**
- Modify: `apps/api/src/routes/cases.ts`
- Test: `apps/api/src/routes/cases.test.ts`

- [ ] **Step 1: Write failing integration tests**
  Test `GET /cases/:id` returns hydrated Case bundle. Test `POST /cases/:id/transition` validates stage progression and writes `AuditEvent`.
- [ ] **Step 2: Run tests to verify failure**
  Run: `pnpm --filter @asc/api test cases.test.ts`
- [ ] **Step 3: Implement `GET /cases/:id`**
  Read Encounter, Appointment, Patient, and ServiceRequest in parallel; compute current physical stage and return structured Case detail.
- [ ] **Step 4: Implement `POST /cases/:id/transition`**
  Validate target stage transition against allowed transitions; update Encounter status; record transition timestamp and audit event.
- [ ] **Step 5: Run tests and commit**
  Commit: `feat(api): implement case read and stage transition endpoints`

---

### Task 6: Wire Case Workspace & Schedule to Live API Client
**Files:**
- Modify: `packages/api-client/src/cases.ts`
- Modify: `apps/web/src/features/case/hooks/use-case.ts`
- Modify: `apps/web/src/features/schedule/hooks/use-schedule.ts`
- Test: `packages/api-client/src/cases.test.ts`

- [ ] **Step 1: Export API client methods `getCase(id)` and `getSchedule(date, facilityId)`**
- [ ] **Step 2: Wire `useCase` and `useSchedule` in `apps/web`**
  Connect React Query hooks to `@asc/api-client`.
- [ ] **Step 3: Verify Case Workspace (`/cases/[caseId]`) loads live case data**
- [ ] **Step 4: Commit**
  Commit: `feat(web): wire case workspace and schedule hooks to api client`

---

### Task 7: Align MSW Mock Handlers & Parity Verification
**Files:**
- Modify: `apps/web/src/mocks/handlers/cases.ts`
- Modify: `apps/web/src/mocks/handlers/schedule.ts`
- Test: `apps/web/src/mocks/handlers.test.ts`

- [ ] **Step 1: Synchronize MSW mock response schemas with `apps/api` contracts**
- [ ] **Step 2: Verify both mock mode (`NEXT_PUBLIC_API_MOCKING=enabled`) and live API mode function identically**
- [ ] **Step 3: Run full web tests**
  Run: `pnpm --filter @asc/web test`
- [ ] **Step 4: Commit**
  Commit: `test(web): synchronize msw mock handlers with live api contracts`

---

### Task 8: Full Monorepo Typecheck, Lint & Integration Gate
- [ ] **Step 1: Run turbo lint across all workspaces**
  Run: `pnpm turbo run lint`
- [ ] **Step 2: Run turbo check-types across all workspaces**
  Run: `pnpm turbo run check-types`
- [ ] **Step 3: Run all test suites across all packages**
  Run: `pnpm turbo run test`
- [ ] **Step 4: Update `PROGRESS.md` with P15c completion**
- [ ] **Step 5: Commit and finalize PR**
  Commit: `chore: verify type safety, linting, and tests across monorepo`
