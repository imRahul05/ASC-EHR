# Fastify Backend APIs (P15c.1: GET /schedule, GET /cases/:id, POST /cases/:id/transition) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the production Fastify 5 backend read and stage-transition endpoints in `apps/api` (`GET /schedule`, `GET /cases/:caseId`, `POST /cases/:caseId/transition`), unblocking live clinical workspace data retrieval and enforcing clinical gate evaluation with strict type safety.

**Architecture:** Operates on Fastify 5 with Medplum FHIR R4 (`Appointment`, `Encounter`, `Patient`, `ServiceRequest`). All queries are strictly date-bounded (`ge${startOfDayIso}` / `le${endOfDayIso}`) and scoped to the active facility. Transitions are validated against `@asc/clinical-rules` `transitionGate` (evaluating Gate 1 and Gate 2) and update the FHIR Encounter extensions (`case-stage`, `case-phase`, `case-stage-timestamps`) via `forFacility()`.

**Tech Stack:** Fastify 5, Medplum FHIR R4 (`@medplum/core`, `@medplum/fhirtypes`), `@asc/clinical-rules`, `@asc/fhir`, `@asc/types`, `@asc/validation`, Vitest.

**Spec:** `docs/plan/phases/P15c-case-workspace-api.md` · `docs/decisions/2026-10-14-single-facility-progressive-mounting-and-mock-alignment.md` · `docs/product/03-target-architecture.md`

---

## Global Constraints

- Absolute ban on `any` and `unknown` types across all packages (strict TypeScript).
- Every query and write MUST retain facility scoping (`forFacility(client, facilityId)` stamping `meta.accounts = ["Organization/<facilityId>"]`).
- No PHI in logs: log only resource IDs, status codes, and non-PHI metadata.
- Commits must be atomic, ≤ 400 changed lines, with conventional commit messages (`feat:`, `test:`, `refactor:`).
- Response payloads must maintain byte-for-byte schema parity with `@asc/types` (`ScheduleDay`, `CaseDetail`).

---

## Review Focus

1. **Unbounded Date Query:** `GET /schedule` without date parameter must default to today's date in ISO format (`YYYY-MM-DD`) and bound queries with explicit start (`00:00:00.000Z`) and end (`23:59:59.999Z`) of day timestamps.
2. **Missing Facility Context:** Calling endpoints without explicit `facilityId` query/header must resolve the caller's granted facility from their token principal or return HTTP 400 `facility_required`.
3. **Clinical Gate 1 & Gate 2 Violations:** `POST /cases/:caseId/transition` to `preop` or `in_room` with unsatisfied non-waivable checks (e.g. unverified identity or unsigned consent) must return HTTP 409 `GATE_FAILED` with structured reasons.
4. **Encounter Stage/Phase Extension Sync:** Updating stage must sync `Encounter.status` (e.g. `arrived` -> `arrived`, `preop` -> `in-progress`, `discharged` -> `finished`), append the timestamp to `case-stage-timestamps`, and update the `case-stage` extension.
5. **N+1 Patient Batching:** Resolving patient details across multiple appointments in `GET /schedule` must use an in-memory cache map to avoid duplicate `readResource("Patient", id)` round trips.

---

## Tasks

### Task 1: Validation Schemas for Schedule Query & Case Transition

**Files:**
- Modify: `packages/validation/src/schedule.ts`
- Create: `packages/validation/src/cases/transition.ts`
- Create: `packages/validation/src/cases/transition.test.ts`
- Modify: `packages/validation/src/index.ts`

**Interfaces:**
- Produces:
  - `getScheduleQuerySchema`, type `GetScheduleQuery` (`date?: string`, `facilityId?: string`)
  - `transitionCaseSchema`, type `TransitionCaseInput` (`to: string`, `reason?: string`, `overrideReason?: string`)

- [ ] **Step 1: Write failing unit test in `packages/validation/src/cases/transition.test.ts`**
  ```ts
  import { describe, expect, it } from "vitest";
  import { transitionCaseSchema } from "./transition.js";

  describe("transitionCaseSchema", () => {
    it("validates valid transition payloads", () => {
      const valid = transitionCaseSchema.safeParse({ to: "preop", reason: "Patient escorted to pre-op" });
      expect(valid.success).toBe(true);
    });

    it("rejects empty target stage", () => {
      const invalid = transitionCaseSchema.safeParse({ to: "" });
      expect(invalid.success).toBe(false);
    });
  });
  ```

- [ ] **Step 2: Run test to verify failure**
  Run: `pnpm --filter @asc/validation test transition.test.ts`
  Expected: FAIL with "Cannot find module './transition.js'"

- [ ] **Step 3: Implement `transition.ts` and update `schedule.ts` & `index.ts`**
  In `packages/validation/src/cases/transition.ts`:
  ```ts
  import { z } from "zod";

  export const transitionCaseSchema = z.object({
    to: z.string().trim().min(1, "Target stage or phase is required"),
    reason: z.string().trim().max(500).optional(),
    overrideReason: z.string().trim().max(500).optional(),
  });

  export type TransitionCaseInput = z.infer<typeof transitionCaseSchema>;
  ```
  In `packages/validation/src/schedule.ts`, add:
  ```ts
  export const getScheduleQuerySchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (expected YYYY-MM-DD)").optional(),
    facilityId: z.string().trim().min(1).optional(),
  });

  export type GetScheduleQuery = z.infer<typeof getScheduleQuerySchema>;
  ```
  Export both from `packages/validation/src/index.ts`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @asc/validation test transition.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add packages/validation/
  git commit -m "feat(validation): add schedule query and case transition schemas"
  ```

---

### Task 2: Implement `GET /schedule` Route in `apps/api`

**Files:**
- Create: `apps/api/src/routes/schedule.ts`
- Create: `apps/api/src/routes/schedule.test.ts`
- Modify: `apps/api/src/routes/index.ts`

**Interfaces:**
- Consumes: `getScheduleQuerySchema` from `@asc/validation`, `capabilityAtResource("schedule.read")`, `CasesMockClient` for tests.
- Produces: `GET /schedule` returning HTTP 200 with `ScheduleDay` (`date`, `rooms`, `cases`).

- [ ] **Step 1: Write failing integration test in `apps/api/src/routes/schedule.test.ts`**
  Verify:
  1. HTTP 401 when unauthenticated.
  2. HTTP 403 when caller lacks `schedule.read`.
  3. HTTP 200 returning `{ date: "2026-10-14", rooms: [...], cases: [...] }` when authorized.
  4. Date bounding: searches within `ge${date}T00:00:00.000Z` and `le${date}T23:59:59.999Z`.

- [ ] **Step 2: Run test to verify failure**
  Run: `pnpm --filter @asc/api test schedule.test.ts`
  Expected: FAIL (route not found / 404)

- [ ] **Step 3: Implement `scheduleRoutes` in `apps/api/src/routes/schedule.ts`**
  - Extract `date` (defaults to `todayIsoDate()`) and `facilityId` (from query or `resolveFacilityId(request)`).
  - Search Medplum for `Appointment` resources within date bounds:
    `["date", `ge${startOfDayIso}`], ["date", `le${endOfDayIso}`], ["_count", "250"]`.
  - Search Medplum for `Encounter` resources within date bounds.
  - Resolve Patient demographics in batch / cached map to avoid N+1 queries.
  - Transform items to `ProcedureCase` and compute rooms with status (`idle`, `in_use`, `turnover`).
  - Register `scheduleRoutes` in `apps/api/src/routes/index.ts`.

- [ ] **Step 4: Run test to verify pass**
  Run: `pnpm --filter @asc/api test schedule.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add apps/api/src/routes/schedule.ts apps/api/src/routes/schedule.test.ts apps/api/src/routes/index.ts
  git commit -m "feat(api): implement date-bounded GET /schedule endpoint"
  ```

---

### Task 3: Implement `GET /cases/:caseId` Route in `apps/api`

**Files:**
- Create: `apps/api/src/services/case-read-service.ts`
- Modify: `apps/api/src/routes/cases.ts`
- Modify: `apps/api/src/routes/cases.test.ts`

**Interfaces:**
- Consumes: `capabilityAtResource("case.read")`, `MedplumClient`.
- Produces: `GET /cases/:caseId` returning HTTP 200 with hydrated `CaseDetail`.

- [ ] **Step 1: Write failing integration test in `apps/api/src/routes/cases.test.ts`**
  ```ts
  describe("GET /cases/:caseId", () => {
    it("returns 401 when unauthenticated", async () => { ... });
    it("returns 403 when caller lacks case.read", async () => { ... });
    it("returns 404 when case encounter does not exist", async () => { ... });
    it("returns 200 with hydrated CaseDetail for an existing case", async () => { ... });
  });
  ```

- [ ] **Step 2: Run test to verify failure**
  Run: `pnpm --filter @asc/api test cases.test.ts`
  Expected: FAIL (route /cases/:caseId not implemented or returns 404)

- [ ] **Step 3: Implement `getCaseDetail` in `apps/api/src/services/case-read-service.ts` & wire into `cases.ts`**
  - Fetch `Encounter` by `caseId` (or appointment identifier).
  - Fetch linked `Patient`, `Appointment`, and `ServiceRequest`.
  - Assemble `CaseDetail` matching `@asc/types`:
    `{ case: procedureCase, patient, hp, consents, vitals, timeOut, events, narration, specimens, images, anesthesia, aldrete, discharge, summary }`.
  - Add `app.get(API_ROUTE_PATTERNS.case, { config: capabilityAtResource("case.read") }, ...)` in `apps/api/src/routes/cases.ts`.

- [ ] **Step 4: Run test to verify pass**
  Run: `pnpm --filter @asc/api test cases.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add apps/api/src/services/case-read-service.ts apps/api/src/routes/cases.ts apps/api/src/routes/cases.test.ts
  git commit -m "feat(api): implement GET /cases/:caseId hydrated detail endpoint"
  ```

---

### Task 4: Implement `POST /cases/:caseId/transition` Route in `apps/api`

**Files:**
- Modify: `apps/api/src/services/case-read-service.ts`
- Modify: `apps/api/src/routes/cases.ts`
- Modify: `apps/api/src/routes/cases.test.ts`

**Interfaces:**
- Consumes: `transitionCaseSchema` from `@asc/validation`, `transitionGate` from `@asc/clinical-rules`, `capabilityAtResource("case.advance")`.
- Produces: `POST /cases/:caseId/transition` returning HTTP 200 with updated `CaseDetail` or HTTP 409 if gate fails.

- [ ] **Step 1: Write failing integration tests in `apps/api/src/routes/cases.test.ts`**
  1. Returns HTTP 403 when caller lacks `case.advance`.
  2. Returns HTTP 409 `GATE_FAILED` when attempting transition to `preop` without signed consent or verified identity.
  3. Returns HTTP 200 and updates `Encounter.status` and extensions when transition is valid.

- [ ] **Step 2: Run tests to verify failure**
  Run: `pnpm --filter @asc/api test cases.test.ts`
  Expected: FAIL

- [ ] **Step 3: Implement `transitionCase` in `apps/api/src/services/case-read-service.ts` & wire into `cases.ts`**
  - Read current `CaseDetail`.
  - Run `transitionGate(detail, body.to)`. If `!result.ok`, return HTTP 409 `{ code: "GATE_FAILED", message: result.reasons[0]?.message, reasons: result.reasons }`.
  - Update `Encounter` in Medplum using `forFacility(client, facilityId).updateResource()`:
    - Update `Encounter.status` from `ENCOUNTER_STATUS_BY_STAGE[stage]`.
    - Update `case-stage` or `case-phase` extensions.
    - Append milestone timestamp.
  - Return updated `CaseDetail` with HTTP 200.
  - Add `app.post(API_ROUTE_PATTERNS.caseTransition, { config: capabilityAtResource("case.advance") }, ...)` in `cases.ts`.

- [ ] **Step 4: Run tests to verify pass**
  Run: `pnpm --filter @asc/api test cases.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add apps/api/src/services/case-read-service.ts apps/api/src/routes/cases.ts apps/api/src/routes/cases.test.ts
  git commit -m "feat(api): implement POST /cases/:caseId/transition with clinical gate evaluation"
  ```

---

### Task 5: Monorepo Verification & Progress Update

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Run turbo check-types and lint across all workspaces**
  Run: `pnpm turbo run check-types lint`
  Expected: All 17 tasks pass with 0 warnings/errors.

- [ ] **Step 2: Run all API tests**
  Run: `pnpm --filter @asc/api test`
  Expected: All test suites pass 100% green.

- [ ] **Step 3: Update `PROGRESS.md`**
  Set P15c status to `in-progress` (or record PR progress).

- [ ] **Step 4: Commit**
  ```bash
  git add PROGRESS.md
  git commit -m "chore(progress): track PR 4 fastify schedule and case routes"
  ```
