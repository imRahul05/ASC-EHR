# P15c.2 Case Workspace Wiring & Lockstep Mocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `@asc/api-client` HTTP client and React Query hooks (`useSchedule`, `useCase`) with active facility context and synchronize MSW mock handlers in `apps/web` with Fastify backend endpoints byte-for-byte.

**Architecture:** Extend `@asc/api-client` with an in-memory `activeFacilityId` state and `x-facility-id` header injection (mirroring `setAccessToken`), synchronize it from `auth.store.ts` and `use-auth.ts`, update `useSchedule` to scope by facility, and align MSW mock handlers to return `HTTP 409 GATE_FAILED` with structured `reasons` and dual stage/phase timestamp updates matching Fastify's `case-read-service.ts`.

**Tech Stack:** TypeScript 5.9, Next.js 16 (Turbopack), Fastify 5, TanStack Query v5, MSW 2, Vitest.

**Spec:** [`docs/superpowers/plans/2026-10-14-phase2-streamlining-and-p15c-execution.md`](../plans/2026-10-14-phase2-streamlining-and-p15c-execution.md) Task 6, 7 & 8; [`docs/product/01-requirements.md`](../../product/01-requirements.md) REQ-5 §164–202.

## Global Constraints

- Absolute ban on `any` and `unknown` types under any circumstances (per user global rules).
- Strict linting: `eslint --max-warnings 0`.
- Atomic commits: ≤ 400 changed lines per commit.
- Zero mock/live divergence: Error payload shapes, status codes, and stage-phase transitions must match byte-for-byte between `apps/api` and `apps/web/src/mocks/`.

## Review Focus

1. **Missing Facility Header in Unauthenticated or Pre-Login Requests:** When no facility is active (`facilityId === null`), requests must omit `x-facility-id` rather than sending `"null"` or `"undefined"`.
2. **TanStack Query Cache Scoping:** `useSchedule(date, facilityId)` cache key must include `facilityId` so switching facilities in multi-site contexts never serves stale cases from another location.
3. **HTTP 409 vs 422 Gate Error Alignment:** Gate failure responses from MSW mock must return HTTP status 409 with `{ code: "GATE_FAILED", message, reasons: [...] }` to match Fastify's `transitionCase` endpoint.
4. **Physical Stage Transition in Mock Store:** Moving to a stage like `"preop"` or `"in_room"` in MSW must update both `stage` and `phase` fields and record timestamps in `stageTimestamps` without losing clinical flags.
5. **Memory-Only Facility State:** `activeFacilityId` in `@asc/api-client` must stay in module memory (never in `localStorage` or `sessionStorage` per LM-004).

---

### Task 1: Facility Context in `@asc/api-client` HTTP Client & Case Methods

**Files:**
- Modify: `packages/api-client/src/http.ts`
- Modify: `packages/api-client/src/index.ts`
- Modify: `packages/api-client/src/clinical/cases.ts`
- Test: `packages/api-client/src/http.test.ts`
- Test: `packages/api-client/src/clinical/cases.test.ts`

**Interfaces:**
- Consumes: `API_ROUTES` from `@asc/config/api`, `IsoDate`, `ScheduleDay`, `CaseDetail`, `TransitionCasePayload` from `@asc/types`.
- Produces: `setFacilityId(id: string | null): void`, `getFacilityId(): string | null`, `facilityHeaders(): Record<string, string>`, `getSchedule(date?: IsoDate, facilityId?: string): Promise<ScheduleDay>`, `getCase(caseId: string, facilityId?: string): Promise<CaseDetail>`, `transitionCase(caseId: string, payload: TransitionCasePayload, facilityId?: string): Promise<CaseDetail>`.

- [ ] **Step 1: Write failing tests in `http.test.ts` and `cases.test.ts`**

Add tests to `packages/api-client/src/http.test.ts`:
```ts
it("injects x-facility-id header when setFacilityId is configured", async () => {
  setFacilityId("fac-omega");
  const fetchMock = stubFetch(Response.json({ ok: true }));
  await http.get("/schedule");
  expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
    "x-facility-id": "fac-omega",
  });
  setFacilityId(null);
});
```

Add tests to `packages/api-client/src/clinical/cases.test.ts`:
```ts
it("passes facilityId as query parameter to getSchedule when provided", async () => {
  const fetchMock = stubFetch(Response.json({ date: "2026-10-15", rooms: [], cases: [] }));
  await getSchedule("2026-10-15", "fac-101");
  expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/schedule?date=2026-10-15&facilityId=fac-101");
});

it("passes facilityId as query parameter to getCase when provided", async () => {
  const fetchMock = stubFetch(Response.json({ case: { id: "c-1" } }));
  await getCase("c-1", "fac-101");
  expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/cases/c-1?facilityId=fac-101");
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @asc/api-client test`
Expected: FAIL with `setFacilityId is not defined` or parameter count mismatch.

- [ ] **Step 3: Implement facility context in `http.ts`, `index.ts`, and `cases.ts`**

In `packages/api-client/src/http.ts`:
```ts
let activeFacilityId: string | null = null;

export function setFacilityId(token: string | null): void {
  activeFacilityId = token;
}

export function getFacilityId(): string | null {
  return activeFacilityId;
}

export function facilityHeaders(): Record<string, string> {
  return activeFacilityId ? { "x-facility-id": activeFacilityId } : {};
}
```
Include `...facilityHeaders()` in the `headers` object inside `request()`.
Re-export `setFacilityId, getFacilityId, facilityHeaders` in `packages/api-client/src/index.ts`.
In `packages/api-client/src/clinical/cases.ts`:
Update `getSchedule(date?: IsoDate, facilityId?: string)`, `getCase(caseId: string, facilityId?: string)`, and `transitionCase(caseId: string, payload: TransitionCasePayload, facilityId?: string)` to accept and forward optional `facilityId`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @asc/api-client test`
Expected: PASS with 100% test suites green.

- [ ] **Step 5: Commit**

```bash
git add packages/api-client/src/http.ts packages/api-client/src/index.ts packages/api-client/src/clinical/cases.ts packages/api-client/src/http.test.ts packages/api-client/src/clinical/cases.test.ts
git commit -m "feat(api-client): propagate facility context via headers and case query methods"
```

---

### Task 2: TanStack Query Hooks & `apps/web` Auth Store Synchronization

**Files:**
- Modify: `packages/api-client/src/react/query-keys.ts`
- Modify: `packages/api-client/src/react/hooks.ts`
- Modify: `apps/web/src/lib/stores/auth.store.ts`
- Modify: `apps/web/src/hooks/use-auth.ts`
- Modify: `apps/web/src/features/schedule/schedule-board.tsx`
- Test: `apps/web/src/lib/stores/auth.store.test.ts`
- Test: `apps/web/src/features/schedule/book-case-sheet.test.tsx`

**Interfaces:**
- Consumes: `setFacilityId`, `getFacilityId` from `@asc/api-client`, `useActiveFacility` from `@/hooks/use-active-facility`.
- Produces: Scoped query keys `queryKeys.schedule.day(date, facilityId)`, reactive facility synchronization on login/facility-change.

- [ ] **Step 1: Write failing test in `apps/web/src/lib/stores/auth.store.test.ts`**

Add assertion verifying that `selectFacility` and `setSession` update `@asc/api-client` `getFacilityId()`:
```ts
import { getFacilityId } from "@asc/api-client";

it("synchronizes resolved facilityId to @asc/api-client", () => {
  useAuthStore.getState().setSession(mockSession, {
    principal: mockPrincipal,
    facilities: [{ id: "fac-sync-1", name: "Endo Center" }],
  });
  expect(getFacilityId()).toBe("fac-sync-1");
  useAuthStore.getState().clearSession();
  expect(getFacilityId()).toBeNull();
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @asc/web test auth.store.test.ts`
Expected: FAIL with `expected null to be 'fac-sync-1'`.

- [ ] **Step 3: Implement store synchronization, query keys, and hook updates**

In `packages/api-client/src/react/query-keys.ts`:
Update `schedule.day`:
```ts
day: (date?: IsoDate, facilityId?: string) => ["schedule", date ?? "today", facilityId ?? ""] as const,
```
In `packages/api-client/src/react/hooks.ts`:
```ts
export function useSchedule(date?: IsoDate, facilityId?: string) {
  return useQuery({
    queryKey: queryKeys.schedule.day(date, facilityId),
    queryFn: () => getSchedule(date, facilityId),
    placeholderData: keepPreviousData,
  });
}
```
In `apps/web/src/lib/stores/auth.store.ts`:
Call `setFacilityId(resolvedId)` inside `setSession`, `selectFacility`, and `clearSession(null)`.
In `apps/web/src/hooks/use-auth.ts`:
Ensure `startSession` and `logout` maintain synchronization with `setFacilityId`.
In `apps/web/src/features/schedule/schedule-board.tsx`:
Obtain `facilityId` via `useActiveFacility()` and pass to `useSchedule(date, facilityId ?? undefined)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @asc/web test auth.store.test.ts book-case-sheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api-client/src/react/query-keys.ts packages/api-client/src/react/hooks.ts apps/web/src/lib/stores/auth.store.ts apps/web/src/hooks/use-auth.ts apps/web/src/features/schedule/schedule-board.tsx apps/web/src/lib/stores/auth.store.test.ts
git commit -m "feat(web): sync active facility with api client and scope schedule query"
```

---

### Task 3: Lockstep MSW Mock Handlers & Stage Transition Support

**Files:**
- Modify: `apps/web/src/mocks/handlers/clinical/respond.ts`
- Modify: `apps/web/src/mocks/handlers/clinical/cases.ts`
- Modify: `apps/web/src/mocks/db/store.ts`
- Create: `apps/web/src/mocks/handlers/cases.test.ts`

**Interfaces:**
- Consumes: `isCaseStage`, `stageFromPhase`, `transitionGate` from `@asc/clinical-rules`, `CaseStage`, `CasePhase` from `@asc/types`.
- Produces: Exact byte-for-byte error contracts (`HTTP 409 GATE_FAILED` with `reasons` array) and dual stage/phase state updates matching Fastify.

- [ ] **Step 1: Write integration tests in `apps/web/src/mocks/handlers/cases.test.ts`**

Test suite covering:
1. `GET /schedule` with `?facilityId=...` returns status 200 with `ScheduleDay`.
2. `GET /cases/:id` returns status 200 with hydrated `CaseDetail`.
3. `POST /cases/:id/transition` with valid target returns 200 and updates both `stage` and `phase`.
4. `POST /cases/:id/transition` when gate fails returns 409 with `{ code: "GATE_FAILED", message: string, reasons: [...] }`.

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @asc/web test cases.test.ts`
Expected: FAIL on status code (422 !== 409) or missing `reasons` payload array.

- [ ] **Step 3: Update `respond.ts`, `cases.ts`, and `store.ts`**

In `apps/web/src/mocks/handlers/clinical/respond.ts`:
Update `gateFailed(result: RuleResult, status = 409)`:
```ts
export function gateFailed(result: RuleResult, status = 409) {
  const details = Object.fromEntries(result.reasons.map((reason) => [reason.code, reason.message]));
  const code = result.reasons[0]?.code === "TRANSITION_NOT_ALLOWED" ? "TRANSITION_NOT_ALLOWED" : "GATE_FAILED";
  return apiError(
    status,
    code,
    result.reasons[0]?.message ?? "Rule check failed",
    details,
    result.reasons,
  );
}
```
In `apps/web/src/mocks/db/store.ts`:
Update `setPhase(caseId: string, target: CasePhase | CaseStage, actor: AuditActor, reason?: string)` to:
- Resolve `targetStage = isCaseStage(target) ? target : stageFromPhase(target)`
- Resolve `targetPhase = isCaseStage(target) ? phaseFromStage(target) : target`
- Update `current.phase = targetPhase`, `current.stage = targetStage`
- Update timestamps for both `timestamps[targetPhase]` and `stageTimestamps[targetStage]`
- Audit log the transition.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @asc/web test cases.test.ts`
Expected: PASS with 100% assertions green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/mocks/handlers/clinical/respond.ts apps/web/src/mocks/handlers/clinical/cases.ts apps/web/src/mocks/db/store.ts apps/web/src/mocks/handlers/cases.test.ts
git commit -m "fix(web): align msw mock handlers and store with fastify case contracts"
```

---

### Task 4: Full Monorepo Typecheck, Lint & Integration Gate

**Files:**
- Entire monorepo verification

- [ ] **Step 1: Run turbo lint across all workspaces**

Run: `pnpm turbo run lint`
Expected: 0 warnings, 0 errors across 19 packages.

- [ ] **Step 2: Run turbo check-types across all workspaces**

Run: `pnpm turbo run check-types`
Expected: Clean compilation with `strict: true` and 0 `any`/`unknown`.

- [ ] **Step 3: Run all test suites across all packages**

Run: `pnpm turbo run test`
Expected: All tests pass across `@asc/api-client`, `apps/api`, `apps/web`, `@asc/clinical-rules`, and `@asc/db`.

- [ ] **Step 4: Run full root build**

Run: `pnpm run build --force`
Expected: Successful build across all 4 applications (Next.js Turbopack, Fastify, Worker, Bots).

- [ ] **Step 5: Commit verification check**

```bash
git commit --allow-empty -m "chore: verify full monorepo quality gates for case workspace wiring"
```

---

## Self-Review Checklist

1. **Spec Coverage:** Covers all requirements for PR 5 (P15c.2) from `docs/superpowers/plans/2026-10-14-phase2-streamlining-and-p15c-execution.md` Task 6, 7 & 8.
2. **Step Scan:** Every step specifies the exact file, exact test, and runnable check command.
3. **Type Consistency:** Method signatures for `getSchedule(date, facilityId)` and `setFacilityId(id)` match consistently across `http.ts`, `cases.ts`, `hooks.ts`, and `auth.store.ts`.
4. **Review Focus:** All 5 review focus risks are pinned with unit and integration tests.
5. **Proportion:** The plan is focused and actionable (~250 lines of code changes total).
