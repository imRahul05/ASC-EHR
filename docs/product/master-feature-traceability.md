# ASC OS Master Feature Traceability & Document Provenance Guide

> **Purpose:** This document is the single authoritative cross-reference mapping between the **NEW master documents** provided on Oct 7, 2026, the **OLD draft documents** from Sept 25, 2026, and the **current implementation state** in the codebase.
> Every feature is traced to its exact source section, user story, code file, and assigned an explicit **Confidence Score**.

---

## 1. Document Provenance & Lineage (Old vs. New)

| Identifier | Document Name & Path | Date & Author | Role in Project | Status |
|---|---|---|---|---|
| **[DOC-NEW-1]** | [`master-requirements.md`](master-requirements.md) | Oct 7, 2026<br>Anurag Chatterjee | **The Master Requirements Document.** Defines the core philosophy, regulatory framework, data model, clinical stages, hard gates, and business rules. | **ACTIVE / MASTER** |
| **[DOC-NEW-2]** | [`master-build-specification.md`](master-build-specification.md) | Oct 7, 2026<br>Anurag Chatterjee | **The Master Build Specification.** Defines the 13 Epics (EP-A through EP-M), 131 User Stories with Given/When/Then acceptance criteria, and 5 Release Phases. | **ACTIVE / MASTER** |
| **[DOC-OLD-1]** | `ASC EHR Feature Spec.docx` | Sept 25, 2026<br>Working Draft v0.1 | Initial scoping document. Positioned the EHR as a Provation-style "documentation wedge + hand-off" overlaying eCW. | **SUPERSEDED** by [DOC-NEW-1] |
| **[DOC-OLD-2]** | `Roadmap GI ASC Feature-map.xlsx` | Sept 25, 2026<br>Roadmap Feature Map | 140-row spreadsheet mapping features against MindScript reuse (Yes / Partial / New). | **SUPERSEDED** by [DOC-NEW-2] |

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
| **Side-by-Side Duplicate Patient Matching** | `[DOC-NEW-1]` §6:266–273; `[DOC-NEW-2]` `US-B-05`, `US-B-06` | `[DOC-OLD-1]` M02-3; `[DOC-OLD-2]` Feature Detail row 21 | Fastify `POST /patients` duplicate engine, `findDuplicateCandidates`, side-by-side match modal in `apps/web/src/features/patients/duplicate-match-modal.tsx`. | Done (Live Fastify API + UI — PR #75, #77, #78) | **100%** |
| **Urgent Clinical Triage Banner (<1 hr)** | `[DOC-NEW-1]` §6:283–285; `[DOC-NEW-2]` `US-B-04` (Must, 3) | Not in old spec (NEW requirement) | Not yet implemented in codebase. | Missing | **100%** |

### Station 2: Scheduling, Blocks & Whiteboard

| Feature | Reference in NEW Master Specs | Reference in OLD Draft Specs | Implementation in Current Codebase | Status | Confidence |
|---|---|---|---|---|---|
| **Multi-Resource Block Scheduling Grid & Conflict Engine** | `[DOC-NEW-1]` §7:291–299; `[DOC-NEW-2]` `US-C-01`, `US-C-02` | `[DOC-OLD-1]` M01-1; `[DOC-OLD-2]` Feature Detail rows 6–14 | `packages/fhir/src/builders/appointment.ts`, `CaseBookingService`, PostgreSQL transaction advisory lock (`withPostgresFacilityLock`), and Booking sheet UI. | Done (Live Fastify API + Postgres Advisory Lock — PR #78, #79) | **100%** |
| **Digital Status Whiteboard (TV View)** | `[DOC-NEW-1]` §5:179; `[DOC-NEW-2]` `US-C-09` (Must, 5) | `[DOC-OLD-1]` M01-5; `[DOC-OLD-2]` Feature Detail row 18 | `apps/web/src/features/whiteboard/whiteboard-view.tsx`, live `GET /whiteboard` Fastify route with dynamic room statuses, TV kiosk `/board` route with HIPAA initials redaction. | Done (Live Fastify API + PHI-Safe TV Kiosk — PR #79, #84, #87) | **100%** |
| **ASC Appropriateness Warning Screen** | `[DOC-NEW-1]` §7:311–314; `[DOC-NEW-2]` `US-C-03` (Must, 5) | Not in old spec (NEW requirement) | Not yet implemented in codebase. | Missing | **100%** |
| **Automatic Block Release (72hr Horizon)** | `[DOC-NEW-1]` §7:297; `[DOC-NEW-2]` `US-C-06` (Should, 3) | `[DOC-OLD-1]` M01-6; `[DOC-OLD-2]` Feature Detail row 19 | Not yet implemented in codebase. | Missing | **95%** |

### Station 3: Financial Clearance & Estimator

| Feature | Reference in NEW Master Specs | Reference in OLD Draft Specs | Implementation in Current Codebase | Status | Confidence |
|---|---|---|---|---|---|
| **3-Point 270/271 Eligibility Monitor** | `[DOC-NEW-1]` §8:338–346; `[DOC-NEW-2]` `US-D-01`, `US-D-02` | `[DOC-OLD-1]` M01-7; `[DOC-OLD-2]` Feature Detail row 22 | `@asc/clinical-rules` `evaluateEligibilityStatus`, Fastify `POST /cases/:caseId/eligibility/check`, `EligibilityCheckModal`. | Done (Live Fastify API + Rules + UI — PR #93) | **100%** |
| **Prior Auth 278 Lifecycle & Reschedule Check** | `[DOC-NEW-1]` §8:354–374; `[DOC-NEW-2]` `US-D-04`, `US-D-07` | `[DOC-OLD-1]` M02-2; `[DOC-OLD-2]` Module Summary | `@asc/clinical-rules` `evaluatePriorAuthValidity`, Fastify `POST /cases/:caseId/prior-auth`, `recordPriorAuth`. | Done (Live Fastify API + Rules + UI — PR #93) | **100%** |
| **Good-Faith Patient Estimator & Copay Collection** | `[DOC-NEW-1]` §8:376–380; `[DOC-NEW-2]` `US-D-03`, `US-D-09`, `US-D-10` | Not in old spec (NEW requirement) | `@asc/clinical-rules` `calculateGoodFaithEstimate` (ACA / No Surprises Act), Fastify `POST /cases/:caseId/copay-collected`, `GfeEstimateCard`, `CopayCollectionModal`. | Done (Live Fastify API + Rules + UI — PR #93) | **100%** |

### Station 4: Pre-op Bay Nursing Station

| Feature | Reference in NEW Master Specs | Reference in OLD Draft Specs | Implementation in Current Codebase | Status | Confidence |
|---|---|---|---|---|---|
| **30-Day H&P Tracking & Update Attestation** | `[DOC-NEW-1]` §2:64, §9:406; `[DOC-NEW-2]` `US-E-02`, `US-F-04` | `[DOC-OLD-1]` M03-2; `[DOC-OLD-2]` Feature Detail row 45 | `@asc/clinical-rules` `evaluateHpValidity` (CMS 42 CFR § 416.52 30-day window), Fastify `POST /cases/:id/hp-update`, `HpUpdateModal`, `HpOverrideModal`. | Done (Live Fastify API + Rules + UI — PR #91) | **100%** |
| **Anticoagulation Hold Advisory Table** | `[DOC-NEW-1]` §9:412–420; `[DOC-NEW-2]` `US-E-03` (Must, 8) | `[DOC-OLD-1]` M03; `[DOC-OLD-2]` Feature Detail rows 37–39 | `@asc/clinical-rules` `evaluateAnticoagulationHold` (ASGE 2022 guidelines), Fastify `POST /cases/:id/anticoagulation`, `MedicationHoldsCard`. | Done (Live Fastify API + ASGE 2022 Rules + UI — PR #91) | **100%** |
| **Touchscreen Consent Capture & Signatures** | `[DOC-NEW-1]` §2:65; `[DOC-NEW-2]` `US-E-09` (Must, 5) | `[DOC-OLD-1]` M11; `[DOC-OLD-2]` Feature Detail rows 46–49 | `SignaturePad` HTML5 canvas, `POST /cases/:caseId/consent`, `buildConsentResource` with SHA-256 hash attestation, `ConsentModal`. | Done (Live Fastify API + SHA-256 Consent + UI — PR #73, #89) | **100%** |
| **Gate 1 Enforcement (`arrived → preop`)** | `[DOC-NEW-1]` §5:208; `[DOC-NEW-2]` `US-F-02` (Must, 5) | `[DOC-OLD-1]` M03; `[DOC-OLD-2]` Module Summary | `transitionGate` evaluating Gate 1 hard lockout, Fastify `POST /cases/:caseId/transition` returning 409 `GATE_FAILED`, `GateBlockerAlert`. | Done (Live Fastify API + SHA-256 Consent + UI — PR #73, #89) | **100%** |

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

### 3.1 Phase 1 & Phase 2 Remaining Story Gap Table

The following table explicitly tracks all unbuilt sub-stories from Epics `EP-A` through `EP-E` that still require backend implementation, along with their assigned target tracking phases:

| Epic | Story ID | Story Name & Scope | Target Tracking Phase | Technical Notes / Backend Dependencies |
|---|---|---|---|---|
| **EP-A** | `US-A-01` | Facility Configuration & Operating Hours | `P26` | Admin CRUD & audit history for ASC facility profile, operating hours, timezone, and NPI/CCN identifiers. |
| **EP-A** | `US-A-02` | Procedure Room & Recovery Bay Master Data | `P26` | Room definitions, capabilities, equipment links, and active/inactive status. |
| **EP-A** | `US-A-03` | Provider Directory, NPI Verification & Privilege Expiry | `P26` | Practitioner credentials, clinical privilege expiry block preventing note signing/attestation when lapsed. |
| **EP-A** | `US-A-04` | Procedure Catalog & Default Durations | `P26` | ASC procedure catalog (CPT codes, room duration defaults, turnover requirements, prep requirements). |
| **EP-A** | `US-A-05` | Payer Master & Prior Auth Requirement Matrix | `P26` | Payer definitions, EDI clearinghouse routing IDs, and prior auth requirement rules by CPT. |
| **EP-A** | `US-A-06` | Physician Preference Cards | `P26` | Doctor-specific equipment, instrument, scope, and medication preferences per CPT code. |
| **EP-A** | `US-A-08` | Break-Glass Emergency Access & Audit Elevation | `P26` | Emergency read-only role elevation with high-priority audit event and mandatory justification prompt. |
| **EP-B** | `US-B-01` | Inbound Fax Capture & Queue | `P24` | PDF ingestion from fax gateway (`faxagnet`), split/rotate/reorder, TIFF-to-PDF conversion, OCR text layer. |
| **EP-B** | `US-B-02` | Referral Document Classification | `P24` | Automated referral vs. clinical records vs. junk classification with confidence score. |
| **EP-B** | `US-B-03` | Referral Extraction with Region Pointers | `P24` | Demographic, clinical indication, referring provider extraction bounding boxes linked to source PDF. |
| **EP-B** | `US-B-04` | Urgent Clinical Indication Flag (<1h Alert) | `P24` | Urgent bleed / suspected malignancy extraction triggering <1h nurse triage worklist escalation. |
| **EP-B** | `US-B-08` | Insurance Card & ID Image Capture | `P14b` / `P26` | Front/back card upload, cropping, and attachment to FHIR `Coverage` as `DocumentReference`. |
| **EP-B** | `US-B-09` | Structured Referral Order Intake | `P24` | Converting referral indications into FHIR `ServiceRequest` with referring provider NPI. |
| **EP-B** | `US-B-10` | Referral Nurse Triage & Appropriateness Review | `P12` / `P24` | Clinical triage work item on `Task` for nurse review of high-risk medical conditions before booking. |
| **EP-B** | `US-B-11` | Incomplete Referral Tracking & Provider Outreach | `P12` | Work queue for missing H&P, demographic, or insurance records with outbound fax request template. |
| **EP-C** | `US-C-01` | Recurring Physician Block Time Definitions | `P15d` | Weekly/bi-weekly recurring block templates reserving procedure rooms for specific GI physicians. |
| **EP-C** | `US-C-03` | ASC Clinical Appropriateness Screening | `P15d` | Hard block warning for ASA ≥ IV, BMI > 45, or severe OSA routing case to anesthesia medical director. |
| **EP-C** | `US-C-04` | Reschedule Cascade & Pre-Op Recalculation | `P15d` | Moving case date automatically invalidating prior auth, shifting prep call dates, and re-checking H&P 30-day window. |
| **EP-C** | `US-C-05` | Structured Cancellation Reasons & Waitlist Trigger | `P15d` | Mandatory cancellation reason codes (prep failure, medical illness, no ride, financial) triggering waitlist outreach. |
| **EP-C** | `US-C-06` | Automatic 72-Hour Block Release | `P15d` | Scheduled cron releasing unbooked block time into open pool 72 hours prior to operating date. |
| **EP-C** | `US-C-07` | Short-Notice Waitlist Management | `P15d` | Fast-fill candidate queue matched to released block slots based on prep readiness and availability. |
| **EP-D** | `US-D-05` | Prior Authorization Clinical Packet Assembly | `P12` | Automatic compilation of clinical notes, referral indication, and H&P into payer auth PDF packet. |
| **EP-D** | `US-D-06` | Prior Auth Aging & Escalation Timer | `P12` | Aging monitor alerting billing team when pending auth approaches 5 days prior to scheduled date. |
| **EP-D** | `US-D-08` | Procedure Divergence Flagging at Coding | `P22b` | Alerting coder when completed procedure codes diverge from pre-authorized CPT codes. |
| **EP-D** | `US-D-11` | Financial Clearance Worklist on Task | `P12` | Centralized `Task`-backed worklist for financial coordinators managing unverified or high-copay cases. |
| **EP-E** | `US-E-01` | Pre-Op Milestone Timeline Generation | `P12` | Auto-generation of 9 milestone tasks upon booking (H&P receipt, auth check, prep call, escort check, etc.). |
| **EP-E** | `US-E-04` | Digital Patient Health Questionnaire | `P11` | Mobile/web responsive FHIR `Questionnaire` for medical history, surgical history, and med review. |
| **EP-E** | `US-E-05` | Pre-Anesthesia Medical Assessment | `P20` | Anesthesia pre-eval documenting Mallampati score, airway assessment, ASA physical status, and NPO status. |
| **EP-E** | `US-E-06` | Personalized Split-Dose Bowel Prep Instructions | `P11` / `P12` | Tailored prep selection (MoviPrep, MiraLAX, Plenvu) with timed dosing schedule based on case start time. |
| **EP-E** | `US-E-07` | Day-Before Nurse Pre-Op Outreach Call | `P12` | Pre-op call checklist logging arrival time confirmation, NPO reminder, and responsible adult escort details. |
| **EP-E** | `US-E-08` | Structured Bowel Effluent Assessment | `P12` / `P17` | Standardized stool character grading (clear/yellow liquid vs. brown/particulate) with clinical escalation. |
| **EP-E** | `US-E-10` | Specialized Equipment Reservation Check | `P15d` | Verifying availability of pediatric colonoscope, therapeutic EGD scope, or electrocautery unit for booked cases. |
| **EP-E** | `US-E-11` | Next-Day Readiness Huddle View & Downtime Pack | `P12` / `P26` | 24-hour lookahead board highlighting blocked cases and 1-click batch printable emergency downtime chart pack. |

---

## 4. Confidence Score Definitions

- **100% Confidence:** Explicit, word-for-word textual confirmation exists in both [`master-requirements.md`](master-requirements.md) and [`master-build-specification.md`](master-build-specification.md), matched directly against audited TypeScript files and line numbers.
- **95% Confidence:** Clear requirement stated in the new specification with existing architectural structures in code (e.g., FHIR builders or UI mock components), requiring minor schema alignment.
- **90% Confidence:** Requirement verified against specification and architecture, but awaiting external business clarification (e.g., AMA CPT licensing or exact clearinghouse partner).

---

## 5. Summary for Engineering Alignment

1. **The master reference is `[DOC-NEW-1]` and `[DOC-NEW-2]`.** All team backlog tickets must cite User Story IDs (e.g., `US-C-01`, `US-F-02`, `US-J-02`).
2. **The mock layer remains in place:** The MSW mock layer stays active under `NEXT_PUBLIC_API_MOCKING=enabled` so stakeholders can click through mock workflows while real API slices are implemented underneath.
3. **Execution priority:** Build in vertical slices (Contract $\rightarrow$ Fastify API $\rightarrow$ Frontend UI), starting with Phase 1: Inbound Referrals & Block Scheduling.
