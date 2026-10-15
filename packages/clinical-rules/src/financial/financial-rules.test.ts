/**
 * Financial Clearance Domain Rules Test Suite
 *
 * Verifies domain logic for:
 * 1. HIPAA 270/271 real-time eligibility evaluation and incomplete 271 degradation detection.
 * 2. HIPAA 278 prior authorization revalidation on case rescheduling or CPT mismatch.
 * 3. ACA 42 U.S.C. § 300gg-13 and No Surprises Act 45 CFR § 149 dual GFE calculation.
 * 4. Front-desk copay collection and payment plan financial clearance satisfaction.
 */

import { describe, it, expect } from "vitest";
import {
  evaluateEligibilityStatus,
  evaluatePriorAuthValidity,
  calculateGoodFaithEstimate,
  evaluateFinancialClearance,
} from "./eligibility-evaluator.js";

describe("Financial rules engine", () => {
  describe("evaluateEligibilityStatus", () => {
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
      expect(result.reason).toContain("Incomplete");
    });

    it("satisfies active eligibility within effective coverage dates", () => {
      const result = evaluateEligibilityStatus(
        {
          status: "active",
          planName: "Aetna",
          planType: "PPO",
          effectiveDate: "2026-01-01",
          terminationDate: "2026-12-31",
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
      expect(result.status).toBe("satisfied");
      expect(result.requiresWorkItem).toBe(false);
    });

    it("fails eligibility if procedure date is past coverage termination date (Month Boundary)", () => {
      const result = evaluateEligibilityStatus(
        {
          status: "active",
          planName: "UnitedHealthcare",
          planType: "EPO",
          effectiveDate: "2026-01-01",
          terminationDate: "2026-09-30", // Terminated end of last month
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
      expect(result.status).toBe("failed");
      expect(result.requiresWorkItem).toBe(true);
      expect(result.reason).toContain("Coverage terminated");
    });

    it("fails eligibility if response status is inactive", () => {
      const result = evaluateEligibilityStatus(
        {
          status: "inactive",
          planName: "Cigna",
          planType: "HMO",
          effectiveDate: "2025-01-01",
          subscriberRelationship: "self",
          inNetwork: true,
          individualDeductibleCents: 0,
          individualDeductibleRemainingCents: 0,
          copayCents: 0,
          coinsurancePercent: 0,
          outOfPocketMaxCents: 0,
          outOfPocketRemainingCents: 0,
          checkedAt: "2026-10-15T06:00:00Z",
        },
        "2026-10-20"
      );
      expect(result.status).toBe("failed");
      expect(result.requiresWorkItem).toBe(true);
    });
  });

  describe("evaluatePriorAuthValidity", () => {
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
      expect(result.codeMismatch).toBe(false);
      expect(result.reason).toContain("outside authorization window");
    });

    it("fails authorization on CPT code mismatch", () => {
      const result = evaluatePriorAuthValidity(
        {
          authNumber: "AUTH-999",
          status: "approved",
          validFrom: "2026-10-01",
          validTo: "2026-10-31",
          approvedCptCodes: ["43239"], // EGD approved, but colonoscopy booked
          approvedUnits: 1,
        },
        "2026-10-20",
        "45378"
      );
      expect(result.status).toBe("failed");
      expect(result.isExpired).toBe(false);
      expect(result.codeMismatch).toBe(true);
      expect(result.reason).toContain("not in approved codes");
    });

    it("satisfies authorization when date is within window and CPT matches", () => {
      const result = evaluatePriorAuthValidity(
        {
          authNumber: "AUTH-999",
          status: "approved",
          validFrom: "2026-10-01",
          validTo: "2026-10-31",
          approvedCptCodes: ["45378", "45385"],
          approvedUnits: 1,
        },
        "2026-10-20",
        "45378"
      );
      expect(result.status).toBe("satisfied");
      expect(result.isExpired).toBe(false);
      expect(result.codeMismatch).toBe(false);
    });

    it("returns not_required when auth status is not_required", () => {
      const result = evaluatePriorAuthValidity(
        {
          authNumber: "NONE",
          status: "not_required",
          validFrom: "2026-01-01",
          validTo: "2026-12-31",
          approvedCptCodes: [],
          approvedUnits: 1,
        },
        "2026-10-20",
        "45378"
      );
      expect(result.status).toBe("not_required");
    });

    it("returns pending when auth is null", () => {
      const result = evaluatePriorAuthValidity(null, "2026-10-20", "45378");
      expect(result.status).toBe("pending");
    });
  });

  describe("calculateGoodFaithEstimate", () => {
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
      // Screening is $0 under ACA preventive mandate
      expect(gfe.estimatedScreeningPatientOwedCents).toBe(0);
      // Therapeutic: $500 deductible + 20% of ($1500 - $500) = $500 + $200 = $700 (70000 cents)
      expect(gfe.estimatedTherapeuticPatientOwedCents).toBe(70000);
      expect(gfe.patientResponsibilityCents).toBe(0);
    });

    it("caps therapeutic estimate at remaining out-of-pocket maximum", () => {
      const gfe = calculateGoodFaithEstimate({
        cptCode: "45378",
        intent: "screening",
        allowableFeeCents: 300000,
        deductibleRemainingCents: 200000,
        coinsurancePercent: 20,
        copayCents: 0,
        preventiveMandateApplies: true,
        outOfPocketRemainingCents: 60000, // Capped at $600
      });
      expect(gfe.estimatedScreeningPatientOwedCents).toBe(0);
      expect(gfe.estimatedTherapeuticPatientOwedCents).toBe(60000);
    });

    it("computes standard diagnostic colonoscopy with deductible and coinsurance owed immediately", () => {
      const gfe = calculateGoodFaithEstimate({
        cptCode: "45378",
        intent: "diagnostic",
        allowableFeeCents: 150000,
        deductibleRemainingCents: 50000,
        coinsurancePercent: 20,
        copayCents: 5000, // $50 copay
        preventiveMandateApplies: false,
      });
      // $50 copay + $500 deductible + 20% of ($1500 - $50 - $500 = $950) = $50 + $500 + $190 = $740 (74000 cents)
      expect(gfe.estimatedScreeningPatientOwedCents).toBe(74000);
      expect(gfe.estimatedTherapeuticPatientOwedCents).toBe(74000);
      expect(gfe.patientResponsibilityCents).toBe(74000);
    });
  });

  describe("evaluateFinancialClearance", () => {
    it("clears financial check when eligibility active, auth satisfied, and copay collected or $0 owed", () => {
      const clearance = evaluateFinancialClearance({
        eligibilityStatus: "satisfied",
        priorAuthStatus: "satisfied",
        estimatedPatientOwedCents: 0,
        collectedCents: 0,
        hasPaymentPlan: false,
      });
      expect(clearance.overallStatus).toBe("cleared");
      expect(clearance.isCleared).toBe(true);
    });

    it("clears financial check when patient owes deductible but has approved payment plan", () => {
      const clearance = evaluateFinancialClearance({
        eligibilityStatus: "satisfied",
        priorAuthStatus: "satisfied",
        estimatedPatientOwedCents: 120000, // $1,200 deductible
        collectedCents: 20000, // $200 down payment collected
        hasPaymentPlan: true, // approved payment plan for remainder
      });
      expect(clearance.overallStatus).toBe("cleared");
      expect(clearance.isCleared).toBe(true);
      expect(clearance.balanceRemainingCents).toBe(100000);
    });

    it("sets action-required if eligibility fails or auth is denied/expired", () => {
      const clearance = evaluateFinancialClearance({
        eligibilityStatus: "failed",
        priorAuthStatus: "satisfied",
        estimatedPatientOwedCents: 0,
        collectedCents: 0,
        hasPaymentPlan: false,
      });
      expect(clearance.overallStatus).toBe("action-required");
      expect(clearance.isCleared).toBe(false);
    });
  });
});
