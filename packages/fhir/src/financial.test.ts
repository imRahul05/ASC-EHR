/**
 * FHIR R4 Financial Builders Test Suite
 *
 * Verifies standard FHIR R4 CoverageEligibilityRequest and CoverageEligibilityResponse builders,
 * Financial readiness Observation builder, and Encounter financial clearance extension.
 * Cites HIPAA ANSI ASC X12 270/271 and X12 278 standards.
 */

import { describe, it, expect } from "vitest";
import {
  buildCoverageEligibilityRequest,
  buildCoverageEligibilityResponse,
  buildFinancialReadinessObservation,
  caseFinancialExtension,
} from "./financial.js";

describe("FHIR R4 financial resource builders", () => {
  describe("buildCoverageEligibilityRequest", () => {
    it("builds normative CoverageEligibilityRequest with patient, coverage, and facility references", () => {
      const req = buildCoverageEligibilityRequest({
        patientId: "patient-1",
        coverageId: "coverage-1",
        facilityId: "facility-a",
        purpose: ["benefits", "validation"],
        servicedDate: "2026-10-20",
        insurerId: "org-payer-1",
      });

      expect(req.resourceType).toBe("CoverageEligibilityRequest");
      expect(req.patient.reference).toBe("Patient/patient-1");
      expect(req.insurance?.[0]?.coverage.reference).toBe("Coverage/coverage-1");
      expect(req.status).toBe("active");
      expect(req.purpose).toEqual(["benefits", "validation"]);
      expect(req.servicedDate).toBe("2026-10-20");
      expect(req.meta?.accounts?.[0]?.reference).toBe("Organization/facility-a");
      expect(req.insurer.reference).toBe("Organization/org-payer-1");
    });

    it("defaults purpose and insurer when omitted", () => {
      const req = buildCoverageEligibilityRequest({
        patientId: "patient-1",
        coverageId: "coverage-1",
        facilityId: "facility-a",
        servicedDate: "2026-10-20",
      });

      expect(req.purpose).toEqual(["benefits", "validation"]);
      expect(req.insurer.reference).toBe("Organization/facility-a");
    });

    it("rejects invalid patient id", () => {
      expect(() =>
        buildCoverageEligibilityRequest({
          patientId: "invalid/id!@#",
          coverageId: "coverage-1",
          facilityId: "facility-a",
          servicedDate: "2026-10-20",
        })
      ).toThrow();
    });
  });

  describe("buildCoverageEligibilityResponse", () => {
    it("builds normative CoverageEligibilityResponse with benefits item breakdown, escaping XHTML characters", () => {
      const res = buildCoverageEligibilityResponse({
        facilityId: "facility-a",
        patientId: "patient-1",
        coverageId: "coverage-1",
        requestId: "req-1",
        insurerId: "org-payer-1",
        status: "active",
        outcome: "complete",
        disposition: "Active in-network coverage with endoscopy benefits",
        inforce: true,
        servicedDate: "2026-10-20",
        benefitPeriod: {
          start: "2026-01-01",
          end: "2026-12-31",
        },
        benefits: {
          individualDeductibleCents: 150000,
          individualDeductibleRemainingCents: 50000,
          copayCents: 2000,
          coinsurancePercent: 20,
          outOfPocketMaxCents: 500000,
          outOfPocketRemainingCents: 250000,
          inNetwork: true,
          serviceTypeCode: "33",
        },
        rawPayload: {
          note: "Eligibility & Benefit <xml> verified",
        },
      });

      expect(res.resourceType).toBe("CoverageEligibilityResponse");
      expect(res.status).toBe("active");
      expect(res.outcome).toBe("complete");
      expect(res.request?.reference).toBe("CoverageEligibilityRequest/req-1");
      expect(res.insurer.reference).toBe("Organization/org-payer-1");
      expect(res.patient.reference).toBe("Patient/patient-1");
      expect(res.insurance?.[0]?.coverage?.reference).toBe("Coverage/coverage-1");
      expect(res.insurance?.[0]?.inforce).toBe(true);
      expect(res.insurance?.[0]?.benefitPeriod?.end).toBe("2026-12-31");

      const items = res.insurance?.[0]?.item;
      expect(items).toBeDefined();
      expect(items?.length).toBeGreaterThan(0);

      // Verify category code 33
      const categoryCode = items?.[0]?.category?.coding?.[0]?.code;
      expect(categoryCode).toBe("33");

      // Verify raw payload narrative retention with HTML escape
      expect(res.text?.status).toBe("generated");
      expect(res.text?.div).toContain("&#38;");
      expect(res.text?.div).toContain("&#60;");
    });

    it("handles out-of-network plan-level benefits with open-ended benefit period and no raw payload", () => {
      const res = buildCoverageEligibilityResponse({
        facilityId: "facility-a",
        patientId: "patient-1",
        coverageId: "coverage-1",
        status: "active",
        outcome: "complete",
        inforce: true,
        created: "2026-10-15T12:00:00Z",
        benefitPeriod: {
          start: "2026-01-01",
        },
        benefits: {
          individualDeductibleCents: 200000,
          outOfPocketMaxCents: 600000,
          inNetwork: false,
          serviceTypeCode: "30",
        },
      });

      expect(res.request?.display).toBe("Direct clearinghouse real-time inquiry");
      expect(res.text).toBeUndefined();
      expect(res.insurance?.[0]?.benefitPeriod?.end).toBeUndefined();

      const items = res.insurance?.[0]?.item;
      expect(items?.[0]?.category?.coding?.[0]?.code).toBe("30");
      expect(items?.[0]?.network?.coding?.[0]?.code).toBe("out");
    });

    it("handles response without benefits or benefitPeriod", () => {
      const res = buildCoverageEligibilityResponse({
        facilityId: "facility-a",
        patientId: "patient-1",
        coverageId: "coverage-1",
        status: "active",
        outcome: "queued",
        inforce: false,
      });

      expect(res.insurance?.[0]?.inforce).toBe(false);
      expect(res.insurance?.[0]?.item).toBeUndefined();
      expect(res.insurance?.[0]?.benefitPeriod).toBeUndefined();
    });

    it("handles benefits with undefined remaining deductibles and default serviceTypeCode", () => {
      const res = buildCoverageEligibilityResponse({
        facilityId: "facility-a",
        patientId: "patient-1",
        coverageId: "coverage-1",
        status: "active",
        outcome: "complete",
        inforce: true,
        benefits: {
          individualDeductibleCents: 100000,
          // individualDeductibleRemainingCents is undefined
          outOfPocketMaxCents: 500000,
          // outOfPocketRemainingCents is undefined
          // serviceTypeCode is undefined -> defaults to "30"
        },
      });

      const items = res.insurance?.[0]?.item;
      expect(items?.[0]?.category?.coding?.[0]?.code).toBe("30");
      expect(items?.[0]?.benefit?.[0]?.usedMoney?.value).toBe(0);
      expect(items?.[0]?.benefit?.[1]?.usedMoney?.value).toBe(0);
    });

    it("handles benefits with copay only (no deductible or outOfPocket)", () => {
      const res = buildCoverageEligibilityResponse({
        facilityId: "facility-a",
        patientId: "patient-1",
        coverageId: "coverage-1",
        status: "active",
        outcome: "complete",
        inforce: true,
        benefits: {
          copayCents: 5000,
        },
      });

      const items = res.insurance?.[0]?.item;
      expect(items?.[0]?.benefit?.length).toBe(1);
      expect(items?.[0]?.benefit?.[0]?.type?.coding?.[0]?.code).toBe("copay");
    });
  });

  describe("buildFinancialReadinessObservation", () => {
    it("builds Observation resource for financial readiness check with details and explicit time", () => {
      const obs = buildFinancialReadinessObservation({
        facilityId: "facility-a",
        patientId: "patient-1",
        encounterId: "encounter-1",
        checkName: "coverage",
        status: "satisfied",
        details: "Active coverage verified via 271 response",
        effectiveDateTime: "2026-10-15T06:00:00Z",
      });

      expect(obs.resourceType).toBe("Observation");
      expect(obs.subject?.reference).toBe("Patient/patient-1");
      expect(obs.encounter?.reference).toBe("Encounter/encounter-1");
      expect(obs.code.coding?.[0]?.code).toBe("coverage");
      expect(obs.valueCodeableConcept?.coding?.[0]?.code).toBe("satisfied");
      expect(obs.note?.[0]?.text).toContain("Active coverage verified");
      expect(obs.meta?.accounts?.[0]?.reference).toBe("Organization/facility-a");
      expect(obs.effectiveDateTime).toBe("2026-10-15T06:00:00Z");
    });

    it("builds Observation resource without details or explicit time", () => {
      const obs = buildFinancialReadinessObservation({
        facilityId: "facility-a",
        patientId: "patient-1",
        encounterId: "encounter-1",
        checkName: "authorization",
        status: "pending",
      });

      expect(obs.note).toBeUndefined();
      expect(obs.code.coding?.[0]?.code).toBe("authorization");
    });
  });

  describe("caseFinancialExtension", () => {
    it("builds case financial summary extension for Encounter with all fields", () => {
      const ext = caseFinancialExtension({
        eligibilityStatus: "active",
        estimatedPatientOwedCents: 50000,
        collectedCents: 50000,
        priorAuthNumber: "AUTH-8821",
        priorAuthStatus: "approved",
        paymentPlanActive: true,
      });

      expect(ext.url).toContain("case-financial");
      expect(ext.extension?.length).toBe(6);
      const authSub = ext.extension?.find((s) => s.url === "priorAuthNumber");
      expect(authSub?.valueString).toBe("AUTH-8821");
      const planSub = ext.extension?.find((s) => s.url === "paymentPlanActive");
      expect(planSub?.valueBoolean).toBe(true);
    });

    it("builds minimal case financial extension", () => {
      const ext = caseFinancialExtension({
        eligibilityStatus: "pending",
        estimatedPatientOwedCents: 0,
      });

      expect(ext.extension?.length).toBe(2);
    });
  });
});
