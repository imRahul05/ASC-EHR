/**
 * Financial Clearance Validation Test Suite
 *
 * Validates Zod schemas enforcing HIPAA X12 270/271, X12 278 Prior Authorization,
 * Patient Protection and Affordable Care Act (ACA 42 U.S.C. § 300gg-13) preventive mandates,
 * and No Surprises Act (45 CFR § 149) Good-Faith Estimate disclosures.
 */

import { describe, it, expect } from "vitest";
import {
  eligibilityCheckRequestSchema,
  eligibilityResponseSchema,
  priorAuthCheckSchema,
  patientEstimateSchema,
  copayCollectionSchema,
} from "./eligibility.js";

describe("Financial clearance validation schemas", () => {
  describe("eligibilityCheckRequestSchema", () => {
    it("validates eligibility request with valid case ID", () => {
      const valid = eligibilityCheckRequestSchema.safeParse({
        caseId: "case-101",
        forceRefresh: true,
        serviceTypeCode: "33", // HIPAA X12 Service Type Code 33 for Chiropractic/Endoscopy
      });
      expect(valid.success).toBe(true);
    });

    it("rejects invalid case ID with illegal characters", () => {
      const invalid = eligibilityCheckRequestSchema.safeParse({
        caseId: "case@101#invalid!",
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("eligibilityResponseSchema", () => {
    it("validates complete active eligibility response", () => {
      const valid = eligibilityResponseSchema.safeParse({
        status: "active",
        planName: "Aetna Choice POS II",
        planType: "PPO",
        effectiveDate: "2026-01-01",
        subscriberRelationship: "self",
        inNetwork: true,
        individualDeductibleCents: 150000,
        individualDeductibleRemainingCents: 50000,
        familyDeductibleCents: 300000,
        familyDeductibleRemainingCents: 100000,
        copayCents: 0,
        coinsurancePercent: 20,
        outOfPocketMaxCents: 500000,
        outOfPocketRemainingCents: 250000,
        checkedAt: "2026-10-15T06:00:00Z",
      });
      expect(valid.success).toBe(true);
    });

    it("rejects negative integer cents for deductible", () => {
      const invalid = eligibilityResponseSchema.safeParse({
        status: "active",
        planName: "Aetna",
        planType: "PPO",
        effectiveDate: "2026-01-01",
        subscriberRelationship: "self",
        inNetwork: true,
        individualDeductibleCents: -500, // Negative not permitted
        individualDeductibleRemainingCents: 0,
        copayCents: 0,
        coinsurancePercent: 20,
        outOfPocketMaxCents: 500000,
        outOfPocketRemainingCents: 250000,
        checkedAt: "2026-10-15T06:00:00Z",
      });
      expect(invalid.success).toBe(false);
    });

    it("validates incomplete status when 271 is degraded", () => {
      const valid = eligibilityResponseSchema.safeParse({
        status: "incomplete",
        planName: "Unknown Plan",
        planType: "HMO",
        effectiveDate: "2026-01-01",
        subscriberRelationship: "spouse",
        inNetwork: false,
        individualDeductibleCents: 0,
        individualDeductibleRemainingCents: 0,
        copayCents: 0,
        coinsurancePercent: 0,
        outOfPocketMaxCents: 0,
        outOfPocketRemainingCents: 0,
        checkedAt: "2026-10-15T06:00:00Z",
      });
      expect(valid.success).toBe(true);
    });
  });

  describe("priorAuthCheckSchema", () => {
    it("validates approved 278 authorization payload", () => {
      const valid = priorAuthCheckSchema.safeParse({
        authNumber: "AUTH-88219",
        status: "approved",
        validFrom: "2026-10-01",
        validTo: "2026-11-30",
        approvedCptCodes: ["45378", "45385"],
        approvedUnits: 1,
        notes: "Approved for screening colonoscopy with possible polypectomy",
      });
      expect(valid.success).toBe(true);
    });

    it("rejects invalid date format for validity range", () => {
      const invalid = priorAuthCheckSchema.safeParse({
        authNumber: "AUTH-88219",
        status: "approved",
        validFrom: "10/01/2026", // Not ISO format
        validTo: "2026-11-30",
        approvedCptCodes: ["45378"],
        approvedUnits: 1,
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("patientEstimateSchema", () => {
    it("validates dual GFE estimate for screening colonoscopy under ACA preventive mandate", () => {
      const valid = patientEstimateSchema.safeParse({
        caseId: "case-101",
        expectedAllowedCents: 150000,
        preventiveCovered: true,
        estimatedScreeningPatientOwedCents: 0, // $0 under ACA 42 U.S.C. § 300gg-13
        estimatedTherapeuticPatientOwedCents: 70000, // $700 if polyp resected
        patientResponsibilityCents: 0,
        deliveryChannel: "sms",
        deliveredAt: "2026-10-15T08:00:00Z",
      });
      expect(valid.success).toBe(true);
    });

    it("rejects floating-point cents in estimate", () => {
      const invalid = patientEstimateSchema.safeParse({
        caseId: "case-101",
        expectedAllowedCents: 1500.5,
        preventiveCovered: false,
        estimatedScreeningPatientOwedCents: 0,
        estimatedTherapeuticPatientOwedCents: 0,
        patientResponsibilityCents: 1500.5,
        deliveryChannel: "email",
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("copayCollectionSchema", () => {
    it("validates successful credit card copay collection", () => {
      const valid = copayCollectionSchema.safeParse({
        caseId: "case-101",
        amountCents: 5000,
        paymentMethod: "credit_card",
        transactionRef: "tx_pay_99812",
        notes: "Collected at front desk during arrival check-in",
      });
      expect(valid.success).toBe(true);
    });

    it("validates payment plan option when patient cannot pay deductible in full", () => {
      const valid = copayCollectionSchema.safeParse({
        caseId: "case-101",
        amountCents: 20000, // Initial $200 down payment
        paymentMethod: "payment_plan",
        paymentPlanDetails: {
          monthlyCents: 10000, // $100/mo
          numberOfMonths: 10,
          firstDueDate: "2026-11-01",
        },
      });
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
});
