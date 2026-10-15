# P16 — Pre-Procedure H&P Review, Day-of Update Note (<30 Days) & Anticoagulation Rule Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the CMS 30-day H&P validity engine with mandatory day-of interval update attestation, the ASGE GI anticoagulation & antiplatelet hold rule engine with bleeding risk stratification, Gate 1 H&P enforcement with physician override, and Gate 2 anticoagulation clearance across `@asc/clinical-rules`, `@asc/validation`, `@asc/fhir`, `apps/api`, `@asc/api-client`, and `apps/web`, maintaining byte-for-byte Fastify 5 vs. MSW mock parity.

**Architecture:** Operates on the decoupled Stage vs. Readiness state machine (REQ-5, EP-E, EP-F). H&P validity is computed against CMS 42 CFR § 416.52 (valid within 30 days of surgery; mandatory day-of interval update note if > 0 days old). Anticoagulation is governed by a pure ASGE-aligned decision engine mapping agent and procedure bleeding risk to recommended hold windows, requiring prescriber instruction capture and day-of patient hold verification. Gate 1 (`arrived` ➔ `preop`) enforces H&P currency with permitted physician override (unlike non-waivable identity/consent), and Gate 2 (`preop` ➔ `in_room`) enforces anticoagulation clearance.

**Tech Stack:** Fastify 5, React 19 / Next.js 16 App Router, Medplum 5.1.42 (FHIR R4 `DocumentReference`, `Observation`, `Encounter`), TanStack Query v5, Zod, Tailwind CSS v4, MSW 2.x, Vitest.

**Spec:** `docs/plan/phases/P16-hp-medhold.md` · `scratch/build_specification.md` (US-E-02, US-E-03, US-F-02, US-F-04, US-F-06, US-M-03) · `scratch/requirements_document.md` (REQ-5, REQ-9, REQ-10).

---

## Global Constraints

- Absolute ban on `any` and `unknown` types across all packages and apps (strict TypeScript).
- Commits must be atomic, ≤ 400 changed lines, with conventional commit messages (`feat:`, `fix:`, `test:`, `refactor:`).
- H&P check can ONLY be waived by an `attending-physician` or `medical-director` with an explicit clinical override reason (AC-F-02-2); `identity` and `consent` remain non-waivable (AC-F-02-3).
- Anticoagulation check is satisfied ONLY once the prescriber's actual instruction is recorded with date given (AC-E-03-4) and day-of hold is confirmed (AC-E-03-5).
- Patient-facing messages never instruct the patient to stop/start/change medication (AC-E-03-6).
- Zero lint warnings (`eslint --max-warnings 0`) and clean typecheck (`tsc --noEmit`).
- MSW mock handlers in `apps/web/src/mocks/` must remain in 100% byte-for-byte lockstep parity with Fastify 5 endpoints.
- Touch targets on clinical screens must be ≥ 44px for gloved and tablet operation (NFR-11).

---

## Review Focus

1. **H&P Expiration (> 30 Days):** An H&P documented 31 days before the procedure must evaluate to `failed` and block Gate 1 (`GATE1_HP`), rejecting any advance to Pre-Op unless overridden by an attending physician.
   - *Test:* `packages/clinical-rules/src/hp/validity.test.ts` asserts `daysOld: 31` returns `status: "failed"` and `isExpired: true`.
2. **Mandatory Day-of Interval Update Note:** An H&P documented 1–30 days before surgery must evaluate to `pending` until an attending physician signs the day-of update note ("No interval change in cardiovascular, pulmonary, or airway status"), transitioning to `satisfied` upon signature.
   - *Test:* `apps/api/src/routes/hp.test.ts` asserts H&P older than procedure date is pending until `POST /cases/:id/hp-update` is called.
3. **Bleeding Risk & Anticoagulant Hold Suggestion:** Given an anticoagulant (e.g. Apixaban 5mg BID) and procedure bleeding risk (`high` for Polypectomy vs `low` for diagnostic EGD), the engine must recommend the ASGE hold window (48h for high risk; 0h for low risk) with rule version `ASGE-2022-v1`.
   - *Test:* `packages/clinical-rules/src/med-hold/anticoagulation.test.ts` verifies recommendation matching across standard GI regimens.
4. **Prescriber Instruction & Patient Confirmation Requirement:** The `anticoagulation` readiness check must NOT be satisfied by empty fields or suggestions alone; it requires explicit prescriber instruction date and patient day-of hold confirmation (AC-E-03-1, AC-E-03-4, AC-E-03-5).
   - *Test:* `apps/api/src/routes/anticoagulation.test.ts` asserts readiness is pending until both prescriber instruction and patient confirmation are recorded.
5. **Role-Restricted Gate 1 H&P Override:** A front desk or non-physician staff member attempting to override an expired H&P must be rejected with HTTP 403 `forbidden`. Only a physician or medical director with a documented rationale can override (AC-F-02-2).
   - *Test:* `apps/api/src/routes/cases.test.ts` asserts non-physician override of Gate 1 H&P is forbidden.

---

## File Structure & Module Responsibilities

```text
packages/clinical-rules/src/
  ├── hp/validity.ts                            NEW   CMS 30-day H&P validity & day-of update engine
  ├── hp/validity.test.ts                       NEW   Unit tests for H&P expiration & interval rules
  ├── med-hold/anticoagulation.ts               NEW   ASGE 2022 GI anticoagulation & bleeding risk engine
  ├── med-hold/anticoagulation.test.ts          NEW   Unit tests for drug classes & hold recommendations
  ├── gates.ts                                  EDIT  Wire validity into evaluateGate1 & Gate 2
  └── index.ts                                  EDIT  Export hp and anticoagulation engines

packages/validation/src/
  ├── hp.ts                                     NEW   Zod schemas for H&P update note & physician override
  ├── hp.test.ts                                NEW   Unit tests for H&P schemas
  ├── anticoagulation.ts                        NEW   Zod schemas for anticoagulation assessment
  ├── anticoagulation.test.ts                   NEW   Unit tests for anticoagulation input
  └── index.ts                                  EDIT  Export hp and anticoagulation contracts

packages/fhir/src/
  ├── builders/hp-update.ts                     NEW   Pure FHIR R4 DocumentReference builder for update note
  ├── builders/hp-update.test.ts                NEW   Unit tests for DocumentReference creation
  ├── builders/anticoagulation.ts               NEW   Pure FHIR R4 Observation builder for med holds
  └── index.ts                                  EDIT  Export builders

apps/api/src/
  ├── services/hp-service.ts                    NEW   H&P update note creation & physician override logic
  ├── services/anticoagulation-service.ts       NEW   Anticoagulation assessment & readiness logic
  ├── routes/cases.ts                           EDIT  Mount POST hp-update, hp-override, anticoagulation
  ├── routes/hp.test.ts                         NEW   Integration tests for H&P endpoints & Gate 1
  └── routes/anticoagulation.test.ts            NEW   Integration tests for anticoagulation endpoints

packages/api-client/src/
  ├── clinical/cases.ts                         EDIT  Add submitHpUpdate, submitHpOverride, submitAnticoagulation
  ├── react/mutation.ts                         EDIT  React Query mutation hooks
  └── clinical/hp.test.ts                       NEW   Unit tests for client methods & query cache

apps/web/src/
  ├── features/case/components/hp-update-modal.tsx    NEW   Modal for day-of physician interval attestation
  ├── features/case/components/hp-override-modal.tsx  NEW   Modal for physician Gate 1 override with reason
  ├── features/case/pre-procedure/medication-holds-card.tsx EDIT Wire structured ASGE table & day-of hold
  ├── features/case/components/gate-blocker-alert.tsx EDIT Add H&P update and override actions
  ├── features/case/hp-flow.test.tsx                  NEW   Component integration tests
  ├── mocks/handlers/clinical/cases.ts                EDIT  Add mock endpoints with byte-for-byte parity
  └── mocks/handlers/cases.test.ts                    EDIT  Integration tests for mock parity
```

---

## Task Decomposition

### Task 1: Clinical Rules Engine for H&P Validity and Anticoagulation Hold (`@asc/clinical-rules`)

**Files:**
- Create: `packages/clinical-rules/src/hp/validity.ts`
- Create: `packages/clinical-rules/src/hp/validity.test.ts`
- Create: `packages/clinical-rules/src/med-hold/anticoagulation.ts`
- Create: `packages/clinical-rules/src/med-hold/anticoagulation.test.ts`
- Modify: `packages/clinical-rules/src/gates.ts:175-260`
- Modify: `packages/clinical-rules/src/index.ts:1-25`

**Interfaces:**
- Produces:
  - `evaluateHpValidity(params: { documentedDate?: string | null; updateNoteSignedDate?: string | null; procedureDate: string }): HpValidityResult`
  - `evaluateAnticoagulationHold(params: { medications: readonly Medication[]; procedureBleedingRisk: "low" | "high" }): AnticoagulationEvaluationResult`
  - Types: `HpValidityResult`, `AnticoagulationEvaluationResult`, `AnticoagulantHoldRecommendation`

- [ ] **Step 1: Write the failing tests for H&P validity**
  Create `packages/clinical-rules/src/hp/validity.test.ts` testing:
  - Missing H&P returns `status: "pending"` with `"H&P not on file"`.
  - H&P older than 30 days returns `status: "failed"` with `isExpired: true`.
  - H&P between 1 and 30 days old without day-of update note returns `status: "pending"` with `requiresUpdateNote: true`.
  - H&P performed today (0 days old) returns `status: "satisfied"`.
  - H&P between 1 and 30 days old WITH day-of update note returns `status: "satisfied"`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @asc/clinical-rules test packages/clinical-rules/src/hp/validity.test.ts`
  Expected: FAIL (module not found).

- [ ] **Step 3: Implement `evaluateHpValidity` in `packages/clinical-rules/src/hp/validity.ts`**
  Implement calendar day difference using `@date-fns` UTC day boundary calculations, enforcing CMS 30-day limit and day-of update requirement.

- [ ] **Step 4: Write failing tests for ASGE anticoagulation hold engine**
  Create `packages/clinical-rules/src/med-hold/anticoagulation.test.ts` testing:
  - Patient with no anticoagulants/antiplatelets returns `status: "satisfied"` with `hasAnticoagulants: false`.
  - Patient taking Apixaban scheduled for high-risk procedure (Polypectomy) recommends 48h hold (`ASGE-2022-v1`).
  - Patient taking Warfarin scheduled for high-risk procedure recommends 5 days hold with target INR < 1.5.
  - Patient taking Clopidogrel recommends 5–7 days hold for high-risk procedure.
  - Aspirin alone continues for standard screening endoscopy unless explicit override.
  - Missing prescriber hold instruction flags check as `pending`.
  - Prescriber instruction present but day-of patient confirmation unconfirmed flags check as `pending`.

- [ ] **Step 5: Implement `evaluateAnticoagulationHold` in `packages/clinical-rules/src/med-hold/anticoagulation.ts`**
  Implement ASGE 2022 rule catalog, bleeding risk classification, hold recommendations, and readiness status.

- [ ] **Step 6: Update `evaluateGate1` and `evaluateGate2` in `packages/clinical-rules/src/gates.ts`**
  - In `evaluateGate1`, connect `hp` check to evaluate `status: "waived"` only when a clinical override reason and permitted role are present.
  - In `evaluateGate2`, connect `anticoagulation` check to `evaluateAnticoagulationHold`.
  - Export from `packages/clinical-rules/src/index.ts`.

- [ ] **Step 7: Run clinical rules tests and verify 100% pass**
  Run: `pnpm --filter @asc/clinical-rules test`
  Expected: PASS (all tests green).

- [ ] **Step 8: Commit**
  ```bash
  git add packages/clinical-rules/
  git commit -m "feat(clinical-rules): implement CMS 30-day hp validity and asge anticoagulation hold engine"
  ```

---

### Task 2: Contracts, Zod Schemas & FHIR Resource Builders (`@asc/validation` & `@asc/fhir`)

**Files:**
- Create: `packages/validation/src/hp.ts`
- Create: `packages/validation/src/hp.test.ts`
- Create: `packages/validation/src/anticoagulation.ts`
- Create: `packages/validation/src/anticoagulation.test.ts`
- Modify: `packages/validation/src/index.ts:1-15`
- Create: `packages/fhir/src/builders/hp-update.ts`
- Create: `packages/fhir/src/builders/hp-update.test.ts`
- Create: `packages/fhir/src/builders/anticoagulation.ts`
- Modify: `packages/fhir/src/index.ts:1-20`

**Interfaces:**
- Produces:
  - Schemas: `hpUpdateNoteSchema`, `hpOverrideSchema`, `anticoagulationAssessmentSchema`
  - Types: `HpUpdateNoteInput`, `HpOverrideInput`, `AnticoagulationAssessmentInput`
  - Builders: `buildHpUpdateDocumentReference`, `buildAnticoagulationObservation`

- [ ] **Step 1: Write failing tests for validation schemas**
  Create `packages/validation/src/hp.test.ts` and `anticoagulation.test.ts`:
  - `hpUpdateNoteSchema`: requires `caseId`, `facilityId`, `attestation` (min 10 chars), `noIntervalChange: true`, `cardiovascularStatus`, `pulmonaryStatus`.
  - `hpOverrideSchema`: requires `caseId`, `facilityId`, `overrideReason` (min 10 chars), `role: "attending-physician" | "medical-director"`.
  - `anticoagulationAssessmentSchema`: requires explicit `hasAnticoagulants: boolean`, validates agent details, prescriber instruction date, and `patientConfirmedHeld`.

- [ ] **Step 2: Run tests to verify failure**
  Run: `pnpm --filter @asc/validation test`
  Expected: FAIL.

- [ ] **Step 3: Implement Zod schemas in `packages/validation/src/hp.ts` and `anticoagulation.ts`**
  Implement strict Zod schemas with descriptive error messages. Export in `packages/validation/src/index.ts`.

- [ ] **Step 4: Implement FHIR R4 builders in `packages/fhir/src/builders/`**
  - `buildHpUpdateDocumentReference`: creates FHIR `DocumentReference` with code `11506-3` (Progress note), status `current`, docStatus `final`, attestation note in description/content, linked to `Encounter/${caseId}` and practitioner.
  - `buildAnticoagulationObservation`: creates FHIR `Observation` with LOINC `80585-3`, structured components for hold instruction and patient confirmation.
  - Export in `packages/fhir/src/index.ts`.

- [ ] **Step 5: Write and run builder tests**
  Create `packages/fhir/src/builders/hp-update.test.ts` and verify generated FHIR resources conform to R4 schema.
  Run: `pnpm --filter @asc/validation test && pnpm --filter @asc/fhir test`
  Expected: PASS.

- [ ] **Step 6: Commit**
  ```bash
  git add packages/validation/ packages/fhir/
  git commit -m "feat(validation): define hp update note, override, and anticoagulation contracts and fhir builders"
  ```

---

### Task 3: Fastify Domain Services & Case Routes (`apps/api`)

**Files:**
- Create: `apps/api/src/services/hp-service.ts`
- Create: `apps/api/src/services/anticoagulation-service.ts`
- Modify: `apps/api/src/routes/cases.ts:230-384`
- Create: `apps/api/src/routes/hp.test.ts`
- Create: `apps/api/src/routes/anticoagulation.test.ts`

**Interfaces:**
- Consumes: Task 1 (rules) and Task 2 (schemas, builders)
- Produces:
  - Routes:
    - `POST /cases/:caseId/hp-update`
    - `POST /cases/:caseId/hp-override`
    - `POST /cases/:caseId/anticoagulation`
    - `GET /cases/:caseId/hp`

- [ ] **Step 1: Write failing integration tests for H&P routes**
  Create `apps/api/src/routes/hp.test.ts` testing:
  - Case with H&P > 30 days old fails Gate 1 (`GATE1_HP`).
  - `POST /cases/:id/hp-update` by attending physician signs day-of update note, sets `hp` readiness check to `satisfied`, and unblocks Gate 1.
  - `POST /cases/:id/hp-override` by attending physician overrides Gate 1 with reason, marking check as `waived`.
  - `POST /cases/:id/hp-override` by front-desk or unauthorized staff returns HTTP 403 `forbidden`.

- [ ] **Step 2: Write failing integration tests for anticoagulation routes**
  Create `apps/api/src/routes/anticoagulation.test.ts` testing:
  - `POST /cases/:id/anticoagulation` records structured medications, evaluates ASGE hold recommendations, and updates `anticoagulation` readiness check.
  - Incomplete hold instruction leaves check as `pending`, failing Gate 2.

- [ ] **Step 3: Implement `hp-service.ts` and `anticoagulation-service.ts`**
  - In `hp-service.ts`:
    - Fetch case `Encounter`, verify procedure date, check existing H&P document date.
    - Save FHIR `DocumentReference` via `forFacility(medplum, facilityId).create(...)`.
    - Atomically update `Encounter` readiness check `hp` to `satisfied` or `waived`.
  - In `anticoagulation-service.ts`:
    - Save FHIR `Observation`s for medication holds.
    - Atomically update `Encounter` readiness check `anticoagulation` to `satisfied` or `failed`.

- [ ] **Step 4: Mount routes in `apps/api/src/routes/cases.ts`**
  - Mount `POST /cases/:caseId/hp-update` with capability `procedure.document`.
  - Mount `POST /cases/:caseId/hp-override` with capability `case.advance` and physician role verification.
  - Mount `POST /cases/:caseId/anticoagulation` with capability `procedure.document`.
  - Mount `GET /cases/:caseId/hp` with capability `case.read`.

- [ ] **Step 5: Run integration tests and verify 100% pass**
  Run: `pnpm --filter api test src/routes/hp.test.ts src/routes/anticoagulation.test.ts`
  Expected: PASS.

- [ ] **Step 6: Commit**
  ```bash
  git add apps/api/
  git commit -m "feat(api): mount hp update, physician override, and anticoagulation case routes"
  ```

---

### Task 4: API Client Mutations & Hooks (`@asc/api-client`)

**Files:**
- Modify: `packages/api-client/src/clinical/cases.ts`
- Modify: `packages/api-client/src/react/mutation.ts`
- Modify: `packages/api-client/src/react/hooks.ts`
- Create: `packages/api-client/src/clinical/hp.test.ts`

**Interfaces:**
- Consumes: Task 2 (types/schemas)
- Produces:
  - Methods: `submitHpUpdateNote`, `submitHpOverride`, `submitAnticoagulationAssessment`, `getHpDetail`
  - React Query hooks: `useSubmitHpUpdateMutation`, `useSubmitHpOverrideMutation`, `useSubmitAnticoagulationMutation`, `useHpDetail`

- [ ] **Step 1: Write failing tests for API client methods**
  Create `packages/api-client/src/clinical/hp.test.ts` testing HTTP POST/GET serialization, header injection (`x-facility-id`), and TanStack Query cache invalidation (`queryKeys.case(caseId)`).

- [ ] **Step 2: Implement client methods in `packages/api-client/src/clinical/cases.ts`**
  Implement typed fetch requests through `http.post` and `http.get`.

- [ ] **Step 3: Implement React Query hooks in `packages/api-client/src/react/`**
  Implement `useSubmitHpUpdateMutation`, `useSubmitHpOverrideMutation`, and `useSubmitAnticoagulationMutation`, invalidating case detail and schedule queries upon success.

- [ ] **Step 4: Run API client test suite**
  Run: `pnpm --filter @asc/api-client test`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add packages/api-client/
  git commit -m "feat(api-client): add hp update, override, and anticoagulation mutations"
  ```

---

### Task 5: Frontend UI & Case Workspace Integration (`apps/web`)

**Files:**
- Create: `apps/web/src/features/case/components/hp-update-modal.tsx`
- Create: `apps/web/src/features/case/components/hp-override-modal.tsx`
- Modify: `apps/web/src/features/case/pre-procedure/medication-holds-card.tsx`
- Modify: `apps/web/src/features/case/components/gate-blocker-alert.tsx`
- Modify: `apps/web/src/features/case/components/stage-stepper.tsx`
- Modify: `apps/web/src/features/case/tabs/pre-procedure-tab.tsx`
- Create: `apps/web/src/features/case/hp-flow.test.tsx`

**Interfaces:**
- Consumes: Task 3 (routes) and Task 4 (hooks)
- Produces:
  - `HpUpdateModal`: Attestation dialog for attending physician
  - `HpOverrideModal`: Gate 1 override dialog with clinical rationale input
  - Enhanced `MedicationHoldsCard`: ASGE hold guidance, prescriber instruction date, day-of hold confirmation

- [ ] **Step 1: Create `HpUpdateModal` in `apps/web/src/features/case/components/hp-update-modal.tsx`**
  - Renders standard CMS day-of attestation text:
    *"I have evaluated the patient on the day of surgery. I confirm there has been no interval change in cardiovascular, pulmonary, airway, or active medical conditions since the H&P dated {hpDate}. The patient is cleared for planned GI endoscopy under sedation."*
  - Requires physician acknowledgment checkbox and digital signature.
  - Submits via `useSubmitHpUpdateMutation`.

- [ ] **Step 2: Create `HpOverrideModal` in `apps/web/src/features/case/components/hp-override-modal.tsx`**
  - Renders warning banner: *"Clinical Override of Pre-Procedure H&P"*.
  - Explains that CMS requires current H&P, and overriding requires Attending Physician or Medical Director credentials.
  - Requires clinical justification textarea (minimum 10 characters).
  - Submits via `useSubmitHpOverrideMutation`.

- [ ] **Step 3: Enhance `GateBlockerAlert` and `StageStepper`**
  - When `GATE1_HP` is present in reasons:
    - Display alert banner with actions: `[Sign Day-of Update Note]` and `[Physician Override]`.
    - Clicking opens `HpUpdateModal` or `HpOverrideModal`.
  - Maintain hard lock on `GATE1_IDENTITY` and `GATE1_CONSENT` (disabling override).

- [ ] **Step 4: Enhance `MedicationHoldsCard` in `PreProcedureTab`**
  - Render ASGE 2022 recommended hold table for detected anticoagulants/antiplatelets.
  - Provide input for prescriber instruction date and instructions.
  - Provide day-of patient hold verification checkbox.
  - Submit via `useSubmitAnticoagulationMutation`.

- [ ] **Step 5: Write component integration tests**
  Create `apps/web/src/features/case/hp-flow.test.tsx` testing opening modal, submitting update note, and observing Gate 1 unblock.
  Run: `pnpm --filter web test src/features/case/hp-flow.test.tsx`
  Expected: PASS.

- [ ] **Step 6: Commit**
  ```bash
  git add apps/web/src/features/case/
  git commit -m "feat(web): integrate hp update modal, physician override, and anticoagulation card"
  ```

---

### Task 6: MSW Mock Handlers & Monorepo Lockstep Parity (`apps/web/src/mocks/`)

**Files:**
- Modify: `apps/web/src/mocks/handlers/clinical/cases.ts:200-350`
- Modify: `apps/web/src/mocks/db/store.ts`
- Modify: `apps/web/src/mocks/handlers/cases.test.ts`
- Modify: `PROGRESS.md`

**Interfaces:**
- Produces: Byte-for-byte Fastify 5 parity across all new endpoints in MSW mock mode.

- [ ] **Step 1: Implement MSW mock handlers in `apps/web/src/mocks/handlers/clinical/cases.ts`**
  - Add `POST /cases/:id/hp-update` mock handler updating `hp` readiness check to `satisfied`.
  - Add `POST /cases/:id/hp-override` mock handler marking `hp` readiness check as `waived` with override reason.
  - Add `POST /cases/:id/anticoagulation` mock handler updating `anticoagulation` check.
  - Add `GET /cases/:id/hp` mock handler.

- [ ] **Step 2: Add integration tests in `apps/web/src/mocks/handlers/cases.test.ts`**
  Verify MSW handlers respond with identical payloads and status codes to Fastify 5.

- [ ] **Step 3: Run full monorepo quality gates**
  Run: `pnpm turbo run lint check-types test`
  Expected: 51/51 tasks green, 0 lint warnings, 0 type errors.

- [ ] **Step 4: Update PROGRESS.md and commit**
  ```bash
  git add apps/web/src/mocks/ PROGRESS.md
  git commit -m "test(web): add lockstep msw mock handlers for hp update, override, and anticoagulation"
  ```

---

## Plan Review & Handoff Checklist

- [x] All 5 Global Constraints satisfied.
- [x] All 5 Review Focus edge cases mapped to automated unit/integration tests.
- [x] Zero `any` and zero `unknown` types enforced across all files.
- [x] MSW mock handlers match Fastify 5 endpoints byte-for-byte.
- [x] Strict adherence to commit size limit (≤ 400 lines per commit).
