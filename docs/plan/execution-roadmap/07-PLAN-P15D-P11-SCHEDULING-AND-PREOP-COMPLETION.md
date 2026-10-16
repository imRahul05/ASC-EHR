# Execution Plan 07 — `P15d` & `P11`: Advanced Block Scheduling, ASC Appropriateness Gate, Reschedule Cascade & Pre-Op Questionnaires (`EP-C` & `EP-E`)

> **Target Branch:** `feat/p15d-p11-scheduling-and-questionnaires`
> **Master Spec Coverage:** `REQ-7` (Scheduling & Block Management), `REQ-9` (Pre-Operative Readiness), `US-C-01` (Recurring Block Templates), `US-C-03` (ASC Appropriateness Screening: ASA ≥ IV, BMI > 45, Severe OSA), `US-C-04` (Reschedule Cascade), `US-C-05` (Structured Cancellation & Waitlist Trigger), `US-C-06` (72-Hour Automatic Block Release), `US-C-07` (Short-Notice Waitlist Matching), `US-E-04` (Digital Patient Health Questionnaire), `US-E-06` (Split-Dose Bowel Prep Instructions), `US-E-07` (Pre-Op Nurse Outreach Call), `US-E-08` (Bowel Effluent Assessment), `US-E-10` (Equipment Reservation Check)
> **Dependencies:** `P01`/`P12` (PR #104), `P15a/b/c` (done)

---

## 1. Mandatory Pre-Flight Reading
Before writing any code, read:
1. [`LEARNING_MISTAKES.md`](../../../LEARNING_MISTAKES.md) (`LM-001`, `LM-003`, `LM-005`, `LM-006`, `LM-014`, `LM-037`, `LM-038`)
2. [`docs/product/master-requirements.md`](../../product/master-requirements.md) (§7 Scheduling & Block Management, §9 Pre-Operative Readiness)
3. [`docs/product/master-build-specification.md`](../../product/master-build-specification.md) (`US-C-01`..`US-C-07`, `US-E-04`, `US-E-06`, `US-E-07`, `US-E-08`, `US-E-10`)
4. [`docs/plan/phases/P15-scheduling-whiteboard.md`](../phases/P15-scheduling-whiteboard.md) and [`docs/plan/phases/P11-questionnaire-renderer.md`](../phases/P11-questionnaire-renderer.md)

## 2. Non-Negotiable Guardrails
- **Zero `any` and Zero `unknown`:** Strictly prohibited in all `.ts` and `.tsx` files.
- **Leaf Subpath Imports (`LM-001`, `LM-005`):** Browser/app code MUST import leaf subpaths (`@asc/validation/scheduling-advanced.schema`, `@asc/validation/questionnaire.schema`, `@asc/clinical-rules/scheduling/appropriateness`, `@asc/clinical-rules/scheduling/block-release`, `@asc/clinical-rules/preop/prep-schedule`, `@asc/fhir/questionnaires/*`). Add every new module to `package.json` `"exports"` and `src/index.ts`.
- **Closed Capability Catalog (`LM-014`):** Reuse existing capabilities from `packages/types/src/capability.ts`:
  - `"schedule.read"`, `"schedule.manage"`, `"case.cancel"`, `"preop.assess"`, `"case.read"`.
- **Composite Route Pre-Handler Pipeline (`LM-037`, `LM-038`):** Use `clinicalMutationRoute` and `clinicalQueryRoute` from `apps/api/src/hooks/pipeline.ts` for all `/cases/:caseId/*` routes.
- **React Hook Budget (`LM-003`):** `useState <= 2`, `useEffect <= 1`, `useLayoutEffect <= 1`, `useRef <= 2` per component.
- **Regulatory Citations (`AGENTS.md` Rule #8):** Cite **CMS 42 CFR § 416.42 & § 416.52** (ASC surgical risk & anesthesia appropriateness evaluation before admission), **ASGE/ACG/AGA 2015 Multi-Society Task Force Guidelines on Bowel Preparation for Colonoscopy** (split-dose bowel preparation timing completed 4–5 hours before sedation and $\ge 2$ hours NPO for clear liquids per **ASA Practice Guidelines**).
- **Atomic Commits (`AGENTS.md` Rule #4):** 6 atomic commits, `<= 400` changed lines per commit, green after every commit.

---

## Commit 1: `feat(types,validation): add ASC appropriateness, reschedule/cancel, waitlist, prep, and questionnaire contracts`

### 1.1 Extend `packages/types/src/clinical.ts`
Add types for `P15d` and `P11`:
- **ASC Appropriateness (`US-C-03`)**:
  ```ts
  export interface AscAppropriatenessInput {
    readonly asaClass: 1 | 2 | 3 | 4 | 5;
    readonly bmi?: number;
    readonly hasSevereOsa?: boolean;
    readonly hasAICDOrPacemaker?: boolean;
    readonly onHomeOxygen?: boolean;
  }
  export interface AscAppropriatenessResult {
    readonly status: "APPROPRIATE" | "REQUIRES_ANESTHESIA_DIRECTOR_REVIEW" | "HOSPITAL_HOPD_RECOMMENDED";
    readonly hardBlockers: readonly string[];
    readonly warnings: readonly string[];
  }
  ```
- **Cancellation, Reschedule & Waitlist (`US-C-04`, `US-C-05`, `US-C-06`, `US-C-07`)**:
  ```ts
  export const CANCELLATION_REASON_CODES = [
    "PREP_FAILURE",
    "MEDICAL_ILLNESS",
    "NO_RESPONSIBLE_ESCORT",
    "NPO_VIOLATION",
    "ANTICOAGULATION_NOT_HELD",
    "FINANCIAL_OR_AUTH_DENIED",
    "PATIENT_NO_SHOW",
    "PATIENT_PERSONAL",
    "PROVIDER_OR_EQUIPMENT",
  ] as const;
  export type CancellationReasonCode = (typeof CANCELLATION_REASON_CODES)[number];

  export interface RescheduleCasePayload {
    readonly newScheduledStartIso: string;
    readonly newRoomId?: string;
    readonly reason: string;
  }
  export interface RescheduleCascadeSummary {
    readonly caseId: string;
    readonly oldDateIso: string;
    readonly newDateIso: string;
    readonly priorAuthInvalidated: boolean;
    readonly hpExpiredForNewDate: boolean;
    readonly recalculatedWorkItemsCount: number;
  }
  export interface CancelCasePayload {
    readonly reasonCode: CancellationReasonCode;
    readonly note?: string;
    readonly rebookOnWaitlist?: boolean;
  }
  export interface WaitlistCandidate {
    readonly caseId: string;
    readonly patient: PatientRef;
    readonly procedureLabel: string;
    readonly cptCode: string;
    readonly surgeonId: string;
    readonly prepReadyWithin48h: boolean;
    readonly financialCleared: boolean;
    readonly priority: "routine" | "urgent";
  }
  ```
- **Split-Dose Bowel Prep & Effluent (`US-E-06`, `US-E-07`, `US-E-08`)**:
  ```ts
  export const BOWEL_PREP_REGIMENS = ["MOVIPREP", "MIRALAX_GATORADE", "PLENVU", "SUFLAVE", "GOLYTELY"] as const;
  export type BowelPrepRegimen = (typeof BOWEL_PREP_REGIMENS)[number];
  export const BOWEL_EFFLUENT_GRADES = ["CLEAR_YELLOW_LIQUID", "CLOUDY_ORANGE", "BROWN_LIQUID", "SOLID_PARTICULATE"] as const;
  export type BowelEffluentGrade = (typeof BOWEL_EFFLUENT_GRADES)[number];

  export interface SplitDosePrepSchedule {
    readonly regimen: BowelPrepRegimen;
    readonly clearLiquidDietStartIso: string;
    readonly dose1StartIso: string;
    readonly dose2StartIso: string;
    readonly npoCutOffIso: string;
    readonly arrivalTimeIso: string;
    readonly instructionsText: string;
  }
  ```

### 1.2 Create `packages/validation/src/scheduling-advanced.schema.ts` & `questionnaire.schema.ts`
- Define `ascAppropriatenessSchema`, `rescheduleCaseSchema`, `cancelCaseSchema`, `equipmentCheckSchema`, `bowelPrepScheduleRequestSchema`, `preopOutreachCallSchema` (logging arrival confirmation, NPO reminder, escort name/phone, and `effluentGrade`), and `questionnaireResponseSubmitSchema`.
- Export both subpaths in `packages/validation/package.json` (`LM-005`) and `packages/validation/src/index.ts` + add unit tests.

Verify with `pnpm --filter @asc/types check-types && pnpm --filter @asc/validation test` and commit.

---

## Commit 2: `feat(clinical-rules): add ASC appropriateness, 72h block release, reschedule cascade, and split-dose prep rules`

### 2.1 Create `packages/clinical-rules/src/scheduling/appropriateness.ts` (`US-C-03`, `US-E-10`)
Cite **CMS 42 CFR § 416.42** and **ASA Physical Status Classification System**.
1. `evaluateAscAppropriateness(input: AscAppropriatenessInput): AscAppropriatenessResult`:
   - `asaClass >= 4` or `bmi > 50` → `status: "HOSPITAL_HOPD_RECOMMENDED"` with hard blocker requiring hospital outpatient department setting or explicit Medical Director override (`AC-C-03-1`).
   - `asaClass === 3` or `(bmi !== undefined && bmi > 45)` or `hasSevereOsa` or `hasAICDOrPacemaker` or `onHomeOxygen` → `status: "REQUIRES_ANESTHESIA_DIRECTOR_REVIEW"` (`AC-C-03-2`).
   - Otherwise `status: "APPROPRIATE"`.
2. `evaluateEquipmentAvailability(requiredEquipmentIds, roomInventory, concurrentBookedEquipment)` (`US-E-10`):
   - Verifies specialized equipment (`pediatric_colonoscope`, `therapeutic_egd_scope`, `argon_plasma_coagulator`, `fluoroscopy_c_arm`) is available and not double-booked in another room during the slot.

### 2.2 Create `packages/clinical-rules/src/scheduling/block-release.ts` (`US-C-01`, `US-C-04`, `US-C-06`, `US-C-07`)
1. `evaluateBlockHoldStatus(block: BlockTemplate, targetDateIso: string, nowIso: string, releaseHorizonHours = 72)` (`US-C-01`, `US-C-06`):
   - Computes whether a surgeon's recurring block is still exclusively held (`hoursUntilSlot > 72`) or automatically released into the open facility pool (`hoursUntilSlot <= 72`) (`AC-C-06-1..2`).
2. `evaluateRescheduleCascade(input)` (`US-C-04`):
   - Checks if new date invalidates existing X12 278 prior auth window (`evaluatePriorAuthValidity`), checks if H&P 30-day window (`evaluateHpValidity`) expires before the new date, and regenerates the `T-14d`..`T-0` pre-op timeline tasks (`buildPreopTimelineWorkItems`).
3. `matchWaitlistCandidatesToSlot(slot, candidates)` (`US-C-07`):
   - Filters and ranks `WaitlistCandidate`s whose `cptCode` default duration fits the released/cancelled slot, prioritizing `urgent` + `financialCleared` + `prepReadyWithin48h`.

### 2.3 Create `packages/clinical-rules/src/preop/prep-schedule.ts` (`US-E-06`, `US-E-08`)
Cite **ASGE/ACG/AGA 2015 Bowel Preparation Guidelines** and **ASA NPO Guidelines**.
1. `calculateSplitDosePrepSchedule(regimen, scheduledStartIso)`:
   - Clear liquid diet starts 24h before procedure.
   - Dose 1 starts 18:00 local evening prior to procedure.
   - Dose 2 starts 5 hours prior to `scheduledStartIso` (`AC-E-06-1`).
   - NPO cutoff (all liquids stopped) is strictly 2 hours prior to `scheduledStartIso` (`AC-E-06-2`).
   - Arrival time is 60 minutes prior to `scheduledStartIso`.
2. `evaluateBowelEffluentReadiness(grade: BowelEffluentGrade)`:
   - `"CLEAR_YELLOW_LIQUID"` → ready (`ok: true`).
   - `"CLOUDY_ORANGE"` → warning (`requiresNurseReview: true`).
   - `"BROWN_LIQUID"` or `"SOLID_PARTICULATE"` → blocker (`ok: false`, triggers clinical escalation / enema or reschedule work item per `AC-E-08-1..2`).

### 2.4 Export & Test
- Export `./scheduling/appropriateness`, `./scheduling/block-release`, and `./preop/prep-schedule` in `packages/clinical-rules/package.json` (`LM-005`) and `src/index.ts`.
- Add unit tests in `packages/clinical-rules/src/scheduling/__tests__/` and `src/preop/__tests__/`.

Verify with `pnpm --filter @asc/clinical-rules test` and commit.

---

## Commit 3: `feat(fhir): add pre-op health questionnaire definition and QuestionnaireResponse builders`

### 3.1 Create `packages/fhir/src/questionnaires/preop-health-history.ts` (`P11`, `US-E-04`)
- Author the canonical GI ASC Pre-Op Health History `Questionnaire` as typed TypeScript data (`PREOP_HEALTH_QUESTIONNAIRE`):
  - Sections: Cardiovascular/anticoagulants (`enableWhen` follow-up for agent name & last dose), Pulmonary/OSA/CPAP (`enableWhen` for CPAP settings), Endocrine/Diabetes/GLP-1 agonists (`enableWhen` for semaglutide/tirzepatide hold check), GI symptoms/alarm features (`dysphagia`, `melena`, `weightLoss`), Prior anesthesia complications, and Responsible adult escort name & phone.
- Implement `buildQuestionnaireResponse(input)` and `extractObservationsFromQuestionnaireResponse(qr: QuestionnaireResponse)` turning submitted answers into discrete FHIR `Observation`s with `Provenance`.
- Export `"./questionnaires/*": "./src/questionnaires/*.ts"` in `packages/fhir/package.json` (`LM-005`) and re-export in `packages/fhir/src/index.ts` + add unit tests.

Verify with `pnpm --filter @asc/fhir test` and commit.

---

## Commit 4: `feat(api): add reschedule cascade, structured cancel, block release, and pre-op prep/questionnaire endpoints`

### 4.1 Extend `packages/config/src/api.ts` & Fastify Routes
- Add to `API_PATHS` in `packages/config/src/api.ts`:
  - `caseReschedule: (caseId: string) => \`/cases/\${caseId}/reschedule\``
  - `caseCancel: (caseId: string) => \`/cases/\${caseId}/cancel\``
  - `casePrepSchedule: (caseId: string) => \`/cases/\${caseId}/prep-schedule\``
  - `caseQuestionnaire: (caseId: string) => \`/cases/\${caseId}/questionnaire\``
  - `scheduleWaitlist: "/schedule/waitlist"`
- In `apps/api/src/routes/cases.ts` and `apps/api/src/routes/preop.ts` (using `clinicalMutationRoute` and `clinicalQueryRoute` per `LM-037`):
  - `POST /cases/:caseId/reschedule` (`capability: "schedule.manage"`, `bodySchema: rescheduleCaseSchema`): runs conflict check + `evaluateRescheduleCascade`, updates `Appointment` & `Encounter`, creates `auth_revalidation` or `hp_expiring` work items if triggered (`US-C-04`).
  - `POST /cases/:caseId/cancel` (`capability: "case.cancel"`, `bodySchema: cancelCaseSchema`): records structured `CancellationReasonCode` on `Appointment.cancelationReason`, sets `Encounter.status = "cancelled"`, creates `cancelled_followup` work item (`US-C-05`), and returns matching waitlist candidates (`US-C-07`).
  - `GET /cases/:caseId/prep-schedule` (`capability: "case.read"`) & `POST /cases/:caseId/questionnaire` (`capability: "preop.assess"`).
- Update `CaseBookingService` (`POST /cases`) to evaluate `evaluateAscAppropriateness` (`US-C-03` — auto-creating an `anesthesia_review` work item when `ASA >= 3` or `BMI > 45`) and `evaluateBlockHoldStatus` (`US-C-06`).
- Add integration tests in `apps/api/src/__tests__/scheduling-advanced.test.ts`.

Verify with `pnpm --filter @asc/api test` and commit.

---

## Commit 5: `feat(ui,api-client): add QuestionnaireForm renderer and scheduling/prep hooks`

### 5.1 Create `packages/ui/src/components/questionnaire/questionnaire-form.tsx` (`P11`)
- Build a clean, accessible (`min-h-11` 44px touch targets per `NFR-11`) presentational `QuestionnaireForm` component in `@asc/ui` supporting `boolean`, `choice`, `string`, `decimal`, `date`, and `group` items with pure `evaluateEnableWhen(item, answers)` conditional visibility.
- Export in `packages/ui/src/index.ts` and add unit tests.

### 5.2 Extend `@asc/api-client`
- Add `rescheduleCase`, `cancelCase`, `getPrepSchedule`, `submitCaseQuestionnaire` in `packages/api-client/src/clinical/cases.ts` and hooks `useRescheduleCase`, `useCancelCase`, `usePrepSchedule`, `useSubmitCaseQuestionnaire` in `packages/api-client/src/react/hooks.ts`.

Verify with `pnpm --filter @asc/ui test && pnpm --filter @asc/api-client test` and commit.

---

## Commit 6: `feat(web): wire appropriateness banner, cancel/reschedule dialogs, prep card, and PROGRESS.md`

### 6.1 Update `apps/web/src/features/schedule/` & `apps/web/src/features/case/`
- In `apps/web/src/features/schedule/book-case-sheet.tsx` (respecting `LM-003` hook budget):
  - Show live `evaluateAscAppropriateness` banner when `ASA >= 3` or `BMI > 45` (`US-C-03`) and 72-hour block release indicator (`US-C-06`).
- Add `CancelRescheduleModal` in `apps/web/src/features/case/` allowing structured cancellation (`CANCELLATION_REASON_CODES` + waitlist match preview per `US-C-05`/`US-C-07`) and rescheduling with cascade impact preview (`US-C-04`).
- Add `SplitDosePrepCard` in `apps/web/src/features/case/tabs/preop-tab.tsx` displaying the timed split-dose schedule (`US-E-06`) and bowel effluent grade check (`US-E-08`).
- Update MSW handlers in `apps/web/src/mocks/handlers/clinical/cases.ts` in lockstep (`LM-006`).
- Update `PROGRESS.md` marking `P15d` and `P11` as `done`.

Verify full monorepo:
```bash
pnpm check-types && pnpm lint && pnpm test && pnpm build
```
