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
```ts
import { describe, it, expect } from "vitest";
import {
  eligibilityCheckRequestSchema,
  eligibilityResponseSchema,
  priorAuthCheckSchema,
  patientEstimateSchema,
  copayCollectionSchema,
} from "./eligibility.js";

describe("Financial clearance validation schemas", () => {
  it("validates eligibility request with valid case ID", () => {
    const valid = eligibilityCheckRequestSchema.safeParse({ caseId: "case-101", forceRefresh: true });
    expect(valid.success).toBe(true);
  });

  it("rejects non-integer cent amounts in copay collection", () => {
    const invalid = copayCollectionSchema.safeParse({
      caseId: "case-101",
      amountCents: 45.5, // floating point not allowed
      paymentMethod: "credit_card",
    });
    expect(invalid.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @asc/validation test`
Expected: FAIL with missing schema imports.

- [ ] **Step 3: Implement schemas in `packages/validation/src/financial/` and export in `packages/validation/src/index.ts`**
Implement `eligibility.ts`, `estimate.ts`, `prior-auth.ts`, ensuring all numbers are strict non-negative integers (`z.number().int().nonnegative()`) and ISO date strings.

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @asc/validation test`
Expected: PASS with 100% green tests.

- [ ] **Step 5: Commit**
```bash
git add packages/validation/src/financial/ packages/validation/src/index.ts
git commit -m "feat(validation): add financial clearance, eligibility, and estimate contracts"
```

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
```ts
import { describe, it, expect } from "vitest";
import {
  evaluateEligibilityStatus,
  evaluatePriorAuthValidity,
  calculateGoodFaithEstimate,
} from "./eligibility-evaluator.js";

describe("Financial rules engine", () => {
  it("flags incomplete eligibility response as pending and requiring work item", () => {
    const result = evaluateEligibilityStatus(
      {
        status: "incomplete",
        planName: "Blue Cross",
        planType: "PPO",
        effectiveDate: "2026-01-01",
        subscriberRelationship: "self",
        inNetwork: true,
        individualDeductibleCents: 100000,
        individualDeductibleRemainingCents: 50000,
        copayCents: 0,
        coinsurancePercent: 20,
        outOfPocketMaxCents: 300000,
        outOfPocketRemainingCents: 150000,
        checkedAt: "2026-10-15T06:00:00Z",
      },
      "2026-10-20"
    );
    expect(result.status).toBe("pending");
    expect(result.requiresWorkItem).toBe(true);
  });

  it("fails authorization if procedure date moves beyond auth validTo date", () => {
    const result = evaluatePriorAuthValidity(
      {
        authNumber: "AUTH-999",
        status: "approved",
        validFrom: "2026-09-01",
        validTo: "2026-10-15",
        approvedCptCodes: ["45378"],
        approvedUnits: 1,
      },
      "2026-10-20", // Rescheduled 5 days after auth expiry
      "45378"
    );
    expect(result.status).toBe("failed");
    expect(result.isExpired).toBe(true);
  });

  it("computes dual GFE for screening colonoscopy with zero copay for screening and deductible for therapeutic", () => {
    const gfe = calculateGoodFaithEstimate({
      cptCode: "45378",
      intent: "screening",
      allowableFeeCents: 150000,
      deductibleRemainingCents: 50000,
      coinsurancePercent: 20,
      copayCents: 0,
      preventiveMandateApplies: true,
    });
    expect(gfe.estimatedScreeningPatientOwedCents).toBe(0);
    expect(gfe.estimatedTherapeuticPatientOwedCents).toBe(70000); // $500 deductible + 20% of remaining $1,000 = $700
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @asc/clinical-rules test`
Expected: FAIL with missing module.

- [ ] **Step 3: Implement domain rules in `packages/clinical-rules/src/financial/`**
Implement calendar day comparisons using `date-fns`, exact integer cent math for deductible/coinsurance, and wire into `evaluateConfirmGate` and overall readiness check in `gates.ts`.

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @asc/clinical-rules test`
Expected: PASS with 100% coverage.

- [ ] **Step 5: Commit**
```bash
git add packages/clinical-rules/src/financial/ packages/clinical-rules/src/gates.ts packages/clinical-rules/src/index.ts
git commit -m "feat(clinical-rules): add financial clearance evaluation, prior auth revalidation, and GFE engine"
```

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
```ts
import { describe, it, expect } from "vitest";
import { buildCoverageEligibilityRequest, buildCoverageEligibilityResponse } from "./financial.js";

describe("FHIR R4 financial resource builders", () => {
  it("builds normative CoverageEligibilityRequest with patient, coverage, and facility references", () => {
    const req = buildCoverageEligibilityRequest({
      patientId: "patient-1",
      coverageId: "coverage-1",
      facilityId: "facility-a",
      purpose: ["benefits", "validation"],
      servicedDate: "2026-10-20",
    });
    expect(req.resourceType).toBe("CoverageEligibilityRequest");
    expect(req.patient.reference).toBe("Patient/patient-1");
    expect(req.status).toBe("active");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @asc/fhir test`
Expected: FAIL with "buildCoverageEligibilityRequest is not defined".

- [ ] **Step 3: Implement FHIR builders in `packages/fhir/src/financial.ts`**
Build valid FHIR R4 `CoverageEligibilityRequest` and `CoverageEligibilityResponse` with item categories (`30` Health Benefit Plan Coverage, `33` Chiropractic / Endoscopy), deductible remaining extensions, and retain raw payload in `CoverageEligibilityResponse.text`.

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @asc/fhir test`
Expected: PASS with all tests passing.

- [ ] **Step 5: Commit**
```bash
git add packages/fhir/src/financial.ts packages/fhir/src/index.ts packages/fhir/src/case-readiness.ts
git commit -m "feat(fhir): add CoverageEligibilityRequest and CoverageEligibilityResponse builders"
```

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
```ts
import { describe, it, expect, vi } from "vitest";
import { buildTestApp } from "../test-helper.js";

describe("Financial clearance routes in Fastify API", () => {
  it("POST /cases/:id/eligibility/check returns 200 and updates case readiness to satisfied when eligible", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/cases/case-101/eligibility/check",
      headers: { authorization: "Bearer front-desk-token" },
      payload: { forceRefresh: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.eligibility.status).toBe("active");
  });

  it("POST /cases/:id/copay-collected posts payment and returns receipt details", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/cases/case-101/copay-collected",
      headers: { authorization: "Bearer front-desk-token" },
      payload: {
        amountCents: 5000,
        paymentMethod: "credit_card",
        transactionRef: "tx_123456",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().paidCents).toBe(5000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter api test src/routes/financial-clearance.test.ts`
Expected: FAIL with 404 Route Not Found.

- [ ] **Step 3: Implement clearinghouse adapter and service in `apps/api/src/services/` and mount routes in `apps/api/src/routes/cases.ts`**
Implement `FinancialClearanceService` using `forFacility(request.medplum, facilityId)` to save FHIR resources atomically and update the case's readiness extensions.

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter api test src/routes/financial-clearance.test.ts`
Expected: PASS with 100% passing tests.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/services/clearinghouse/ apps/api/src/services/financial-clearance-service.ts apps/api/src/routes/cases.ts
git commit -m "feat(api): implement eligibility check, financial summary, and copay collection endpoints"
```

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
```ts
import { describe, it, expect, vi } from "vitest";
import { checkEligibility, getFinancialSummary } from "./financial.js";

describe("Financial clearance API client", () => {
  it("calls POST /cases/:caseId/eligibility/check with active facility header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ eligibility: { status: "active" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await checkEligibility("case-101", { forceRefresh: true }, "facility-a");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/cases/case-101/eligibility/check"),
      expect.objectContaining({ method: "POST" })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @asc/api-client test`
Expected: FAIL with "checkEligibility is not defined".

- [ ] **Step 3: Implement client methods and hooks in `@asc/api-client`**
Ensure query key invalidation refreshes `queryKeys.cases.detail(caseId)` and `queryKeys.schedule.all`.

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @asc/api-client test`
Expected: PASS with 100% tests green.

- [ ] **Step 5: Commit**
```bash
git add packages/api-client/src/clinical/financial.ts packages/api-client/src/react/ packages/api-client/src/index.ts
git commit -m "feat(api-client): add financial clearance client methods and React Query hooks"
```

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
```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FinancialClearanceCard } from "./financial-clearance-card.js";

describe("FinancialClearanceCard", () => {
  it("renders active coverage and dual GFE estimate for screening colonoscopy", () => {
    render(
      <FinancialClearanceCard
        caseId="case-101"
        summary={{
          eligibilityStatus: "active",
          planName: "Aetna Choice POS II",
          deductibleRemainingCents: 50000,
          screeningOwedCents: 0,
          therapeuticOwedCents: 70000,
          copayBalanceCents: 0,
          priorAuthStatus: "approved",
          authNumber: "AUTH-8821",
        }}
      />
    );
    expect(screen.getByText(/Aetna Choice POS II/i)).toBeInTheDocument();
    expect(screen.getByText(/\$0/)).toBeInTheDocument(); // Screening estimate
    expect(screen.getByText(/\$700/)).toBeInTheDocument(); // Therapeutic estimate
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter web test src/features/case/financial/financial-clearance-card.test.tsx`
Expected: FAIL with component not found.

- [ ] **Step 3: Implement UI components in `apps/web/src/features/case/financial/`**
Implement `FinancialClearanceCard`, `GfeEstimateCard`, `CopayCollectionModal`, respecting high-contrast clinical theme, touch targets >= 44px (`min-h-11`), zero `any` or `unknown`.

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter web test src/features/case/financial/financial-clearance-card.test.tsx`
Expected: PASS with 100% green tests.

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/features/case/financial/ apps/web/src/features/case/case-detail.tsx apps/web/src/features/whiteboard/
git commit -m "feat(web): add FinancialClearanceCard, dual GFE estimate, and copay collection modals"
```

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
```ts
it("exercises MSW mock POST /cases/:id/eligibility/check and updates financial summary in lockstep with Fastify", async () => {
  const client = createTestApiClient();
  const res = await client.checkEligibility("case_101", { forceRefresh: true });
  expect(res.eligibility.status).toBe("active");
  const summary = await client.getFinancialSummary("case_101");
  expect(summary.eligibilityStatus).toBe("active");
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter web test src/mocks/handlers/cases.test.ts`
Expected: FAIL with unhandled mock request.

- [ ] **Step 3: Implement MSW handlers in `apps/web/src/mocks/handlers/clinical/cases.ts`**
Ensure store updates and 409 conflict handling match Fastify 5 byte-for-byte.

- [ ] **Step 4: Run full verification suite across all packages**
Run: `pnpm turbo run lint check-types test`
Expected: 100% passing across all packages (`FULL TURBO`), 0 lint warnings, 0 type errors.

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/mocks/
git commit -m "test(mocks): align MSW handlers with Fastify financial clearance endpoints in lockstep"
```

---

## Plan Review & Handoff Checklist
- [ ] Spec coverage verified against `build_specification.md` US-D-01 through US-D-12.
- [ ] All monetary quantities represented in integer cents (`amountCents`).
- [ ] Strict type safety: zero `any` and zero `unknown`.
- [ ] Fastify 5 and MSW mock parity guaranteed.
- [ ] Review Focus edge cases pinned by concrete tests.
