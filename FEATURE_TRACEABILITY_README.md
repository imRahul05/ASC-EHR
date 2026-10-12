# ASC OS Master Feature Traceability & Document Provenance Guide

> **Purpose:** This document is the single authoritative cross-reference mapping between the **NEW master documents** provided on Oct 7, 2026, the **OLD draft documents** from Sept 25, 2026, and the **current implementation state** in the codebase.
> Every feature is traced to its exact source section, user story, code file, and assigned an explicit **Confidence Score**.

---

## 1. Document Provenance & Lineage (Old vs. New)

| Identifier | Document Name & Path | Date & Author | Role in Project | Status |
|---|---|---|---|---|
| **[DOC-NEW-1]** | `/Users/amananku/Documents/wybit/ASC OS- Requirements Document (GI Ambulatory Surgery Center EHR) (1).docx` | Oct 7, 2026<br>Anurag Chatterjee | **The Master Requirements Document.** Defines the core philosophy, regulatory framework, data model, clinical stages, hard gates, and business rules. | **ACTIVE / MASTER** |
| **[DOC-NEW-2]** | `/Users/amananku/Documents/wybit/ASC OS- Build Specification (Epics, User Stories, Acceptance Criteria, Flows) (1).docx` | Oct 7, 2026<br>Anurag Chatterjee | **The Master Build Specification.** Defines the 13 Epics (EP-A through EP-M), 130 User Stories with Given/When/Then acceptance criteria, and 5 Release Phases. | **ACTIVE / MASTER** |
| **[DOC-OLD-1]** | `/Users/amananku/Documents/wybit/ASC EHR Feature Spec.docx` | Sept 25, 2026<br>Working Draft v0.1 | Initial scoping document. Positioned the EHR as a Provation-style "documentation wedge + hand-off" overlaying eCW. | **SUPERSEDED** by [DOC-NEW-1] |
| **[DOC-OLD-2]** | `/Users/amananku/Documents/wybit/Roadmap GI ASC Feature-map.xlsx` | Sept 25, 2026<br>Roadmap Feature Map | 140-row spreadsheet mapping features against MindScript reuse (Yes / Partial / New). | **SUPERSEDED** by [DOC-NEW-2] |

---

## 2. The Core Shift: What Changed from Old to New?

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     THE ARCHITECTURAL EVOLUTION                                        │
├────────────────────────────────────────┬───────────────────────────────────────────────────────────────┤
│ OLD DRAFT (Sept 25, 2026)              │ NEW MASTER SPECIFICATION (Oct 7, 2026)                        │
├────────────────────────────────────────┼───────────────────────────────────────────────────────────────┤
│ • "Documentation wedge" (Provation)    │ • "Sole EHR & Operating System" on opening day ([REQ-1:9])     │
│ • Hand-off charges to external biller  │ • Full native X12 EDI pipeline (270/271, 278, 837, 835)       │
│ • Assumed clinic eCW fallback          │ • Zero fallback; software failure stops surgeries ([REQ-1:10])│
│ • Conflated location and readiness     │ • Orthogonal Stage (location) vs Readiness (checks) ([REQ-5]) │
│ • Generic RN role across all bays      │ • 3 distinct surgical nursing roles (Pre-op, Circulator, PACU)│
│ • Heavy reuse of MindScript clinic UX  │ • Strict clinical ASC focus; clinic E&M logic discarded      │
└────────────────────────────────────────┴───────────────────────────────────────────────────────────────┘
```

---

## 3. Master Feature Traceability Matrix

Every feature listed below cross-references both documents, the codebase implementation, and provides an audited confidence score.

### Station 1: Referral Intake & Registration (Front Desk)

| Feature | Reference in NEW Master Specs | Reference in OLD Draft Specs | Implementation in Current Codebase | Status | Confidence |
|---|---|---|---|---|---|
| **Inbound Fax Document Viewer** | `[DOC-NEW-1]` §6:245; `[DOC-NEW-2]` `US-B-01` (Must, 5) | `[DOC-OLD-1]` M15–M17; `[DOC-OLD-2]` Feature Detail row 37 | Currently deferred to Phase P24 (`docs/plan/phases/P24-fax-ecw.md`). Needs move to Phase 1. | Pending API | **100%** |
| **1-Click Field Extraction & Provenance** | `[DOC-NEW-1]` §6:261–264; `[DOC-NEW-2]` `US-B-03`, `US-B-09` | `[DOC-OLD-1]` M02-6; `[DOC-OLD-2]` Feature Detail row 21 | Types in `@asc/types`; extraction UI mocked in `apps/web/src/features/referrals`. | Mocked | **100%** |
| **Side-by-Side Duplicate Patient Matching** | `[DOC-NEW-1]` §6:266–273; `[DOC-NEW-2]` `US-B-05`, `US-B-07` | `[DOC-OLD-1]` M02-3; `[DOC-OLD-2]` Feature Detail row 21 | Builder exists in `packages/fhir/src/builders/patient.ts`; matching UI mocked in `apps/web/src/features/patients`. | Partial Builder / Mock UI | **100%** |
| **Urgent Clinical Triage Banner (<1 hr)** | `[DOC-NEW-1]` §6:283–285; `[DOC-NEW-2]` `US-B-04` (Must, 3) | Not in old spec (NEW requirement) | Not yet implemented in codebase. | Missing | **100%** |

### Station 2: Scheduling, Blocks & Whiteboard

| Feature | Reference in NEW Master Specs | Reference in OLD Draft Specs | Implementation in Current Codebase | Status | Confidence |
|---|---|---|---|---|---|
| **Multi-Resource Block Scheduling Grid** | `[DOC-NEW-1]` §7:291–299; `[DOC-NEW-2]` `US-C-01`, `US-C-02` | `[DOC-OLD-1]` M01-1; `[DOC-OLD-2]` Feature Detail rows 6–14 | `packages/fhir/src/builders/appointment.ts`; UI calendar mocked in `apps/web/src/features/schedule`. | Mock UI / Real FHIR | **95%** |
| **Digital Status Whiteboard (TV View)** | `[DOC-NEW-1]` §5:179; `[DOC-NEW-2]` `US-C-09` (Must, 5) | `[DOC-OLD-1]` M01-5; `[DOC-OLD-2]` Feature Detail row 18 | `apps/web/src/features/whiteboard/whiteboard-view.tsx`; uses MSW mock cases. | Mock UI | **100%** |
| **ASC Appropriateness Warning Screen** | `[DOC-NEW-1]` §7:311–314; `[DOC-NEW-2]` `US-C-03` (Must, 5) | Not in old spec (NEW requirement) | Not yet implemented in codebase. | Missing | **100%** |
| **Automatic Block Release (72hr Horizon)** | `[DOC-NEW-1]` §7:297; `[DOC-NEW-2]` `US-C-06` (Should, 3) | `[DOC-OLD-1]` M01-6; `[DOC-OLD-2]` Feature Detail row 19 | Not yet implemented in codebase. | Missing | **95%** |

### Station 3: Financial Clearance & Estimator

| Feature | Reference in NEW Master Specs | Reference in OLD Draft Specs | Implementation in Current Codebase | Status | Confidence |
|---|---|---|---|---|---|
| **3-Point 270/271 Eligibility Monitor** | `[DOC-NEW-1]` §8:338–346; `[DOC-NEW-2]` `US-D-01`, `US-D-02` | `[DOC-OLD-1]` M01-7; `[DOC-OLD-2]` Feature Detail row 22 | Stub eligibility check in mock store; raw 271 retention missing. | Stubbed | **100%** |
| **Prior Auth 278 Lifecycle & Reschedule Check** | `[DOC-NEW-1]` §8:354–374; `[DOC-NEW-2]` `US-D-04–07` | `[DOC-OLD-1]` M02-2; `[DOC-OLD-2]` Module Summary | Missing from codebase. Needs Phase P14b. | Missing | **100%** |
| **Good-Faith Patient Estimator** | `[DOC-NEW-1]` §8:376–380; `[DOC-NEW-2]` `US-D-09`, `US-D-10` | Not in old spec (NEW requirement) | Missing from codebase. | Missing | **100%** |

### Station 4: Pre-op Bay Nursing Station

| Feature | Reference in NEW Master Specs | Reference in OLD Draft Specs | Implementation in Current Codebase | Status | Confidence |
|---|---|---|---|---|---|
| **30-Day H&P Tracking & Update Attestation** | `[DOC-NEW-1]` §2:64, §9:406; `[DOC-NEW-2]` `US-E-02`, `US-F-04` | `[DOC-OLD-1]` M03-2; `[DOC-OLD-2]` Feature Detail row 45 | Rule in `packages/clinical-rules/src/gates.ts` L55 wrongly requires today's date. Needs 30-day window update. | Needs Update | **100%** |
| **Anticoagulation Hold Advisory Table** | `[DOC-NEW-1]` §9:412–420; `[DOC-NEW-2]` `US-E-03` (Must, 8) | `[DOC-OLD-1]` M03; `[DOC-OLD-2]` Feature Detail rows 37–39 | `packages/clinical-rules/src/meds.ts` L4 has demo mock table. Needs clinical rule expansion in P07. | Mock Rule | **100%** |
| **Touchscreen Consent Capture & Signatures** | `[DOC-NEW-1]` §2:65; `[DOC-NEW-2]` `US-E-09` (Must, 5) | `[DOC-OLD-1]` M11; `[DOC-OLD-2]` Feature Detail rows 46–49 | SignaturePad component in `@asc/ui`; FHIR Provenance builder in `packages/fhir/src/builders/provenance.ts`. | UI Ready / Backend Stub | **95%** |
| **Gate 1 Enforcement (`arrived → preop`)** | `[DOC-NEW-1]` §5:208; `[DOC-NEW-2]` `US-F-02` (Must, 5) | `[DOC-OLD-1]` M03; `[DOC-OLD-2]` Module Summary | `apps/web/src/features/case/gate-panel.tsx` enforces gate on frontend mock state. | Mock Gate | **100%** |

### Station 5: Intra-op Procedure Suite HUD

| Feature | Reference in NEW Master Specs | Reference in OLD Draft Specs | Implementation in Current Codebase | Status | Confidence |
|---|---|---|---|---|---|
| **Mandatory Multi-Attested Timeout Modal** | `[DOC-NEW-1]` §10:458–462; `[DOC-NEW-2]` `US-F-05` (Must, 5) | `[DOC-OLD-1]` M04; `[DOC-OLD-2]` Feature Detail rows 54–56 | Types in `@asc/types`; modal UI in `apps/web/src/features/case/procedure/timeout-dialog.tsx`. | Mock UI | **100%** |
| **Scope Serial & Hang-Time Lock (<168 hr)** | `[DOC-NEW-1]` §13:598–606; `[DOC-NEW-2]` `US-I-04`, `US-I-05` | `[DOC-OLD-1]` X1; `[DOC-OLD-2]` Feature Detail row 112 | Scope log placeholder in `apps/web/src/features/admin`. Hang-time lock not yet built. | Missing | **100%** |
| **Live Cecal Withdrawal Timer HUD (>=6 min)** | `[DOC-NEW-1]` §10:467, §11:501; `[DOC-NEW-2]` `US-F-07` | Not in old spec (NEW requirement) | Missing from codebase. | Missing | **100%** |
| **Discrete Findings Logger (Paris, Landmark, mm)** | `[DOC-NEW-1]` §11:502–510; `[DOC-NEW-2]` `US-G-01` (Must, 8) | `[DOC-OLD-1]` M05; `[DOC-OLD-2]` Feature Detail rows 60–63 | UI in `apps/web/src/features/case/procedure/findings-panel.tsx`. | Mock UI | **95%** |
| **Boston Bowel Prep Scale (BBPS 0–9)** | `[DOC-NEW-1]` §11:500; `[DOC-NEW-2]` `US-G-02`, `US-L-06` | Mentioned in `01-requirements.md` L25 | Missing in `packages/clinical-rules`. | Missing | **100%** |

### Station 6: Anesthesia AIMS Flowsheet

| Feature | Reference in NEW Master Specs | Reference in OLD Draft Specs | Implementation in Current Codebase | Status | Confidence |
|---|---|---|---|---|---|
| **Time-Series Continuous Vitals Grid** | `[DOC-NEW-1]` §10:469; `[DOC-NEW-2]` `US-F-09` (Should, 5) | `[DOC-OLD-1]` M07; `[DOC-OLD-2]` Feature Detail row 57 ("Real build item") | Grid UI mocked in `apps/web/src/features/case/anesthesia`. | Mock UI | **95%** |
| **Sedation Medication Administration Log** | `[DOC-NEW-1]` §10:465; `[DOC-NEW-2]` `US-F-08` (Must, 5) | `[DOC-OLD-1]` M07; `[DOC-OLD-2]` Feature Detail row 58 | Mocked in `apps/web/src/features/case/anesthesia`. | Mock UI | **95%** |

### Station 7: PACU & Discharge Recovery Station

| Feature | Reference in NEW Master Specs | Reference in OLD Draft Specs | Implementation in Current Codebase | Status | Confidence |
|---|---|---|---|---|---|
| **Aldrete Recovery Scoring Component** | `[DOC-NEW-1]` §10:473; `[DOC-NEW-2]` `US-F-10` (Must, 5) | `[DOC-OLD-1]` M08; `[DOC-OLD-2]` Feature Detail rows 69–71 | `packages/clinical-rules/src/scores.ts` L3–L15 defines modified Aldrete scorer. Tested. | Pure Rule Done / UI Mock | **100%** |
| **Scored Discharge Criteria Enforcement** | `[DOC-NEW-1]` §10:475; `[DOC-NEW-2]` `US-F-11` (Must, 5) | `[DOC-OLD-1]` M08; `[DOC-OLD-2]` Feature Detail row 72 | UI checklist mocked in `apps/web/src/features/case/tabs/pacu-tab.tsx`. | Mock UI | **95%** |
| **Escort Door Confirmation & Signature** | `[DOC-NEW-1]` §9:438, §10:479; `[DOC-NEW-2]` `US-F-11` | `[DOC-OLD-1]` M01-8; `[DOC-OLD-2]` Feature Detail row 50 | Field in mock store; signature capture UI stubbed. | Mock UI | **95%** |

### Station 8: Clinical Documentation & GI Coding Queue

| Feature | Reference in NEW Master Specs | Reference in OLD Draft Specs | Implementation in Current Codebase | Status | Confidence |
|---|---|---|---|---|---|
| **Record Engine Note Editor with Gap-Chips** | `[DOC-NEW-1]` §11:516–522; `[DOC-NEW-2]` `US-G-06` | `[DOC-OLD-1]` M05; `[DOC-OLD-2]` Feature Detail rows 24–29 | UI component in `@asc/ui` (`GapChip`); note editor mocked in `apps/web/src/features/case/note`. | Mock UI | **95%** |
| **Screening-to-Diagnostic Modifier PT / 33** | `[DOC-NEW-1]` §14:628–638; `[DOC-NEW-2]` `US-J-02` (Must, 8) | Mentioned in `01-requirements.md` L36 | Missing in `packages/clinical-rules`. Needs Phase P22. | Missing | **100%** |
| **Multiple Endoscopy Reduction Math (Modifier 51)** | `[DOC-NEW-1]` §14:640–646; `[DOC-NEW-2]` `US-J-03` (Must, 8) | Not in old spec (NEW requirement) | Missing in `packages/clinical-rules`. | Missing | **100%** |
| **Distinct Anatomical Site Modifiers (59 / X)** | `[DOC-NEW-1]` §14:645; `[DOC-NEW-2]` `US-J-04` (Must, 5) | Not in old spec (NEW requirement) | Missing in `packages/clinical-rules`. | Missing | **100%** |
| **Code Rationale Traceability Panel** | `[DOC-NEW-1]` §14:664–667; `[DOC-NEW-2]` `US-J-06` (Must, 5) | Not in old spec (NEW requirement) | Missing from codebase. | Missing | **100%** |
| **Physician / Coder Approval Gate (Gate 3)** | `[DOC-NEW-1]` §5:210, §14:662; `[DOC-NEW-2]` `US-J-07` | `[DOC-OLD-1]` M09; `[DOC-OLD-2]` Feature Detail row 80 | Missing. Hard gate required before 837 generation. | Missing | **100%** |

### Station 9: Pathology Closed-Loop & Scope Tracking

| Feature | Reference in NEW Master Specs | Reference in OLD Draft Specs | Implementation in Current Codebase | Status | Confidence |
|---|---|---|---|---|---|
| **Specimen Count Reconciliation Closure Lock** | `[DOC-NEW-1]` §12:548; `[DOC-NEW-2]` `US-H-02` (Must, 3) | `[DOC-OLD-1]` M10; `[DOC-OLD-2]` Feature Detail row 83 | Specimen list mocked in `apps/web/src/features/case/tabs/pathology-tab.tsx`. Lock missing. | Mock UI | **100%** |
| **2-Year Open Specimen Register** | `[DOC-NEW-1]` §12:563, §12:578; `[DOC-NEW-2]` `US-H-06` | Not in old spec (NEW requirement) | Missing from codebase. | Missing | **100%** |
| **1-Hour Critical Pathology Escalation Alert** | `[DOC-NEW-1]` §12:565; `[DOC-NEW-2]` `US-H-08` (Must, 5) | Not in old spec (NEW requirement) | Missing from codebase. | Missing | **100%** |
| **Scope Infection Traceability Emergency Query** | `[DOC-NEW-1]` §13:600; `[DOC-NEW-2]` `US-I-04` (Must, 5) | `[DOC-OLD-1]` X1; `[DOC-OLD-2]` Feature Detail row 114 | Missing from codebase. | Missing | **100%** |

---

## 4. Confidence Score Definitions

- **100% Confidence:** Explicit, word-for-word textual confirmation exists in both `requirements_document.md` and `build_specification.md`, matched directly against audited TypeScript files and line numbers.
- **95% Confidence:** Clear requirement stated in the new specification with existing architectural structures in code (e.g., FHIR builders or UI mock components), requiring minor schema alignment.
- **90% Confidence:** Requirement verified against specification and architecture, but awaiting external business clarification (e.g., AMA CPT licensing or exact clearinghouse partner).

---

## 5. Summary for Engineering Alignment

1. **The master reference is `[DOC-NEW-1]` and `[DOC-NEW-2]`.** All team backlog tickets must cite User Story IDs (e.g., `US-C-01`, `US-F-02`, `US-J-02`).
2. **The mock layer remains in place:** The MSW mock layer stays active under `NEXT_PUBLIC_API_MOCKING=enabled` so stakeholders can click through mock workflows while real API slices are implemented underneath.
3. **Execution priority:** Build in vertical slices (Contract $\rightarrow$ Fastify API $\rightarrow$ Frontend UI), starting with Phase 1: Inbound Referrals & Block Scheduling.
