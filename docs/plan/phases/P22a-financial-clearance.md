# P22a — Financial Clearance, 270/271 Real-Time Eligibility Monitor & 278 Prior Auth Revalidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Phase P22a Financial Clearance engine for Ambulatory Surgery Center Gastrointestinal endoscopy cases, encompassing automated X12 270/271 real-time eligibility verification, 3-point scheduled monitor sweeps (booking, T-7 days, 06:00 Day of Surgery), 278 prior authorization validity and reschedule recheck, Good-Faith Estimate (GFE) dual-calculation (preventive screening vs therapeutic polyp removal), and front-desk copay/deductible collection.

**Architecture:** Pure contracts in `@asc/validation` define 270/271 eligibility inquiries, benefits breakdown, 278 auth verification, and patient estimates; pure domain rules in `@asc/clinical-rules` parse benefits, evaluate financial clearance readiness, calculate dual GFEs under the No Surprises Act, and detect auth expiry on rescheduled cases; pure FHIR R4 builders in `@asc/fhir` construct `CoverageEligibilityRequest` and `CoverageEligibilityResponse` resources and update `Encounter` case readiness extensions; live Fastify 5 endpoints in `apps/api` execute real-time eligibility checks via a pluggable clearinghouse adapter and record copay collections; `@asc/api-client` provides typed SDK calls and React Query hooks; `apps/web` renders the `FinancialClearanceCard`, dual GFE estimate drawer, copay collection dialog, and Whiteboard financial badges; and MSW mocks maintain byte-for-byte parity with Fastify 5.

**Tech Stack:** TypeScript 7.0 (strict mode), Fastify 5, Medplum 5.1.42 (FHIR R4), Next.js 16 App Router, React 19, Tailwind CSS v4, shadcn UI, Zod 3.24, Vitest, MSW 2.

**Spec:** `scratch/build_specification.md` (§10 Epic EP-D, stories US-D-01 through US-D-12, AC-D-01-1 through AC-D-12-4) · `scratch/requirements_document.md` (REQ-5, REQ-8) · `docs/plan/phases/P22-coding-charge.md` · `docs/plan/implementation-plan.md`.

## Global Constraints

- Absolute ban on `any` and `unknown` types across all packages (`RULE[user_global]`).
- All financial monetary amounts must be stored as integer cents (`amountCents: number`) to prevent floating-point rounding errors.
- Never log Patient Health Information (PHI) or subscriber numbers in server logs (`COMPLIANCE_AND_PHI.md`).
- Raw X12 271 and 278 responses must be retained unmodified in FHIR `CoverageEligibilityResponse` for auditability (`AC-D-01-3`).
- Incomplete 271 responses (silent on GI endoscopy service type or plan-level only) must be evaluated as `incomplete` / `pending`, NEVER assumed as active coverage (`AC-D-02-1..4`).
- Colonoscopy estimates must present dual pricing: preventive screening ($0 copay under ACA preventive mandate) and therapeutic outcome (deductible/coinsurance applies if polyps are removed) (`AC-D-09-2`).
- Rescheduling a case outside an approved 278 authorization window immediately fails the `authorization` readiness check and blocks the case (`AC-D-07-1`).
- Fastify 5 API endpoints and MSW mock handlers must share identical payload schemas, HTTP status codes, and error shapes byte-for-byte.
- Mandatory Regulatory Citations & Logic Explanations: Every file implementing US laws or clinical guidelines (e.g. ACA Preventive Mandate 42 U.S.C. § 300gg-13, No Surprises Act 45 CFR § 149, HIPAA ANSI X12 270/271/278 standards) must explicitly cite the law, section, and clinical rationale in JSDoc/code comments. All non-trivial domain logic, integer cent math, and status transitions must include comments explaining the rationale and edge-case handling (strictly excluding PHI).

## Review Focus

1. **Degraded/Incomplete 271 Responses:** A payer 271 response returns `active` coverage for general medical but omits service type `33` (Chiropractic), `30` (Health Benefit Plan Coverage), or GI endoscopy specifically. The engine must treat benefits as `response_incomplete`, set readiness to `pending`, and create a financial verification work item instead of giving a false-positive clearance (`AC-D-02-1`).
2. **Rescheduled Date Exceeding 278 Auth Window:** A patient's procedure is moved from October 20 to November 15, but their approved prior authorization expires on October 31. The engine must immediately flip `authorization` readiness from `satisfied` to `failed` and flag the case on the schedule board (`AC-D-07-1`).
3. **Screening Colonoscopy Deductible Surprise (No Surprises Act / ACA):** Patient is booked for screening colonoscopy (CPT `45378`). If polyps are resected during the procedure (CPT `45385`), the claim becomes therapeutic with modifier `33` or `PT`. The estimate generated must explicitly show both the $0 screening liability and the estimated coinsurance if therapeutic resection occurs (`AC-D-09-2`).
4. **Coverage Termination at Month Boundary:** Patient's insurance terminated on the 1st of the month, but initial check at booking was active. The T-7 or 06:00 day-of sweep must catch the termination, update readiness to `failed`, and prevent confirmation (`AC-D-01-4`).
5. **Partial Copay Collection & Payment Plans:** Patient cannot pay full estimated deductible of $1,200 at check-in. Recording an approved payment plan must record the schedule, log the actor, and transition financial check to satisfied without dropping the balance owed (`AC-D-10-2`).

---

### Task 1: Validation Contracts in `@asc/validation`

**Files:**
- Create: `packages/validation/src/financial/eligibility.ts`
- Create: `packages/validation/src/financial/estimate.ts`
- Create: `packages/validation/src/financial/prior-auth.ts`
- Modify: `packages/validation/src/index.ts`
- Test: `packages/validation/src/financial/financial.test.ts`

**Interfaces:**
- Consumes: None (base validation layer).
- Produces:
  - `eligibilityCheckRequestSchema`: `{ caseId: string; forceRefresh?: boolean; serviceTypeCode?: string }`
  - `eligibilityResponseSchema`: `{ status: "active" | "inactive" | "incomplete" | "error"; planName: string; planType: string; effectiveDate: string; terminationDate?: string; subscriberRelationship: "self" | "spouse" | "child" | "other"; inNetwork: boolean; individualDeductibleCents: number; individualDeductibleRemainingCents: number; familyDeductibleCents?: number; familyDeductibleRemainingCents?: number; copayCents: number; coinsurancePercent: number; outOfPocketMaxCents: number; outOfPocketRemainingCents: number; rawPayload?: Record<string, string | number | boolean | null>; checkedAt: string }`
  - `priorAuthCheckSchema`: `{ authNumber: string; status: "approved" | "denied" | "pending" | "not_required"; validFrom: string; validTo: string; approvedCptCodes: readonly string[]; approvedUnits: number; notes?: string }`
  - `patientEstimateSchema`: `{ caseId: string; expectedAllowedCents: number; preventiveCovered: boolean; estimatedScreeningPatientOwedCents: number; estimatedTherapeuticPatientOwedCents: number; patientResponsibilityCents: number; deliveryChannel: "sms" | "email" | "portal" | "in_person"; deliveredAt?: string; acknowledgedAt?: string }`
  - `copayCollectionSchema`: `{ caseId: string; amountCents: number; paymentMethod: "credit_card" | "debit_card" | "cash" | "check" | "payment_plan"; transactionRef?: string; paymentPlanDetails?: { monthlyCents: number; numberOfMonths: number; firstDueDate: string }; notes?: string }`

- [ ] **Step 1: Write failing test in `packages/validation/src/financial/financial.test.ts`**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement schemas in `packages/validation/src/financial/` and export in `packages/validation/src/index.ts`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 2: Pure Domain Rules in `@asc/clinical-rules`

**Files:**
- Create: `packages/clinical-rules/src/financial/eligibility-evaluator.ts`
- Create: `packages/clinical-rules/src/financial/gfe-calculator.ts`
- Create: `packages/clinical-rules/src/financial/prior-auth-evaluator.ts`
- Modify: `packages/clinical-rules/src/gates.ts`
- Modify: `packages/clinical-rules/src/index.ts`
- Test: `packages/clinical-rules/src/financial/financial-rules.test.ts`

**Interfaces:**
- Consumes: `@asc/types`, `@asc/validation`.
- Produces:
  - `evaluateEligibilityStatus(response: EligibilityResponse, procedureDate: string): { status: "satisfied" | "pending" | "failed"; reason?: string; requiresWorkItem: boolean }`
  - `evaluatePriorAuthValidity(auth: PriorAuthRecord | null, procedureDate: string, plannedCptCode: string): { status: "satisfied" | "pending" | "failed" | "not_required"; isExpired: boolean; codeMismatch: boolean; reason?: string }`
  - `calculateGoodFaithEstimate(input: GfeCalculationInput): GfeCalculationResult`
  - `evaluateFinancialClearance(caseData: FinancialCaseContext): FinancialClearanceSummary`

- [ ] **Step 1: Write failing test in `packages/clinical-rules/src/financial/financial-rules.test.ts`**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement domain rules in `packages/clinical-rules/src/financial/`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 3: Pure FHIR R4 Builders in `@asc/fhir`

**Files:**
- Create: `packages/fhir/src/financial.ts`
- Modify: `packages/fhir/src/index.ts`
- Modify: `packages/fhir/src/case-readiness.ts`
- Test: `packages/fhir/src/financial.test.ts`

**Interfaces:**
- Consumes: `@asc/types`, `@asc/validation`.
- Produces:
  - `buildCoverageEligibilityRequest(params: CoverageEligibilityRequestParams): CoverageEligibilityRequest`
  - `buildCoverageEligibilityResponse(params: CoverageEligibilityResponseParams): CoverageEligibilityResponse`
  - `buildFinancialReadinessObservation(params: FinancialReadinessParams): Observation`
  - `caseFinancialExtension(params: FinancialExtensionParams): Extension`

- [ ] **Step 1: Write failing test in `packages/fhir/src/financial.test.ts`**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement FHIR builders in `packages/fhir/src/financial.ts`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 4: Clearinghouse Adapter & Fastify 5 Endpoints in `apps/api`

**Files:**
- Create: `apps/api/src/services/clearinghouse/clearinghouse-client.ts`
- Create: `apps/api/src/services/clearinghouse/mock-clearinghouse-adapter.ts`
- Create: `apps/api/src/services/financial-clearance-service.ts`
- Modify: `apps/api/src/routes/cases.ts`
- Test: `apps/api/src/routes/financial-clearance.test.ts`

**Interfaces:**
- Consumes: `@asc/validation`, `@asc/clinical-rules`, `@asc/fhir`, `@asc/authz`.
- Produces:
  - `POST /cases/:id/eligibility/check`: Runs real-time 270 inquiry, parses 271, writes FHIR `CoverageEligibilityResponse`, updates case readiness. Requires capability `patient.eligibility.check`.
  - `GET /cases/:id/financial-summary`: Returns full financial summary (benefits, GFE dual-estimate, auth status, copay balance). Requires capability `case.read`.
  - `POST /cases/:id/copay-collected`: Records patient portion collected at desk, receipts transaction, transitions check. Requires capability `patient.register` or `financial.manage`.
  - `POST /cases/:id/prior-auth`: Records approved/denied 278 authorization details.

- [ ] **Step 1: Write failing test in `apps/api/src/routes/financial-clearance.test.ts`**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement clearinghouse adapter and service in `apps/api/src/services/` and mount routes in `apps/api/src/routes/cases.ts`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 5: Client SDK & React Query Hooks in `@asc/api-client`

**Files:**
- Create: `packages/api-client/src/clinical/financial.ts`
- Modify: `packages/api-client/src/clinical/cases.ts`
- Modify: `packages/api-client/src/react/hooks.ts`
- Modify: `packages/api-client/src/react/keys.ts`
- Modify: `packages/api-client/src/index.ts`
- Test: `packages/api-client/src/clinical/financial.test.ts`

**Interfaces:**
- Consumes: `@asc/validation`, `@asc/types`.
- Produces:
  - `checkEligibility(caseId: string, payload?: EligibilityCheckRequest, facilityId?: string): Promise<EligibilityCheckResult>`
  - `getFinancialSummary(caseId: string, facilityId?: string): Promise<FinancialSummary>`
  - `collectCopay(caseId: string, payload: CopayCollectionInput, facilityId?: string): Promise<CopayCollectionResult>`
  - `recordPriorAuth(caseId: string, payload: PriorAuthInput, facilityId?: string): Promise<PriorAuthResult>`
  - `useFinancialSummary(caseId: string, facilityId?: string)`
  - `useCheckEligibility()`
  - `useCollectCopay()`

- [ ] **Step 1: Write failing test in `packages/api-client/src/clinical/financial.test.ts`**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement client methods and hooks in `@asc/api-client`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 6: UI Components & Case Workspace Integration in `apps/web`

**Files:**
- Create: `apps/web/src/features/case/financial/financial-clearance-card.tsx`
- Create: `apps/web/src/features/case/financial/eligibility-check-modal.tsx`
- Create: `apps/web/src/features/case/financial/gfe-estimate-card.tsx`
- Create: `apps/web/src/features/case/financial/copay-collection-modal.tsx`
- Modify: `apps/web/src/features/case/case-detail.tsx`
- Modify: `apps/web/src/features/case/gate-blocker-alert.tsx`
- Modify: `apps/web/src/features/whiteboard/whiteboard-tile.tsx`
- Test: `apps/web/src/features/case/financial/financial-clearance-card.test.tsx`

**Interfaces:**
- Consumes: `@asc/ui`, `@asc/api-client`, `@asc/clinical-rules`.
- Produces:
  - Interactive financial clearance card showing 271 benefits breakdown, prior auth validity badge, and dual-estimate (preventive vs therapeutic).
  - Front-desk copay collection modal with receipt generation and payment plan options.
  - Whiteboard financial clearance icon (`cleared` green, `flagged` amber, `action-required` red).

- [ ] **Step 1: Write failing test in `apps/web/src/features/case/financial/financial-clearance-card.test.tsx`**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement UI components in `apps/web/src/features/case/financial/`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 7: MSW Mock Handlers & Byte-for-Byte Lockstep Verification

**Files:**
- Modify: `apps/web/src/mocks/handlers/clinical/cases.ts`
- Modify: `apps/web/src/mocks/handlers/clinical/patients.ts`
- Modify: `apps/web/src/mocks/db/store.ts`
- Test: `apps/web/src/mocks/handlers/cases.test.ts`

**Interfaces:**
- Consumes: `@asc/validation`, Fastify 5 contracts.
- Produces:
  - Exact MSW intercepts for `POST /cases/:id/eligibility/check`, `GET /cases/:id/financial-summary`, `POST /cases/:id/copay-collected`.
  - Byte-for-byte lockstep with Fastify 5 API error responses (HTTP 400, 403, 404, 409, 422).

- [ ] **Step 1: Write integration test in `apps/web/src/mocks/handlers/cases.test.ts`**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement MSW handlers in `apps/web/src/mocks/handlers/clinical/cases.ts`**
- [ ] **Step 4: Run full verification suite across all packages**
- [ ] **Step 5: Commit**
