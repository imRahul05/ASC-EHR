import { describe, expect, it } from "vitest";
import type { PreAnesthesiaAssessment, ReadinessCheck } from "@asc/types";
import { anesthesiaMinutes, evaluatePreAnesthesiaReadiness } from "../pre-anesthesia.js";
import { evaluateGate2 } from "../../gates.js";

const mockAssessment: PreAnesthesiaAssessment = {
  asaClass: 2,
  mallampati: 2,
  airwayNotes: "Normal airway",
  lastOralIntakeIso: "2026-10-16T02:00:00.000Z",
  npoStatusSatisfied: true,
  assessedAt: "2026-10-16T08:00:00.000Z",
  assessedBy: { id: "p1", name: "Dr. Chen", initials: "RC" },
};

describe("aims/pre-anesthesia (CMS 42 CFR § 416.42(a))", () => {
  describe("evaluatePreAnesthesiaReadiness", () => {
    it("fails when assessment is missing or null", () => {
      const result = evaluatePreAnesthesiaReadiness(null);
      expect(result.ok).toBe(false);
      expect(result.reasons.some((r) => r.code === "PRE_ANESTHESIA_EVAL_COMPLETE")).toBe(true);
    });

    it("passes for ASA Class 1-3 with confirmed NPO status", () => {
      const result = evaluatePreAnesthesiaReadiness(mockAssessment);
      expect(result.ok).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it("blocks when ASA Class is 4 or 5 without director clearance", () => {
      const highRisk = { ...mockAssessment, asaClass: 4 as const };
      const result = evaluatePreAnesthesiaReadiness(highRisk);
      expect(result.ok).toBe(false);
      expect(result.reasons.some((r) => r.code === "ASA_PHYSICAL_STATUS_ELIGIBLE")).toBe(true);
      expect(result.reasons[0]?.message).toContain("ASA Class 4 presents severe systemic instability");
    });

    it("blocks when NPO fasting guidelines are not satisfied", () => {
      const npoViolated = { ...mockAssessment, npoStatusSatisfied: false };
      const result = evaluatePreAnesthesiaReadiness(npoViolated);
      expect(result.ok).toBe(false);
      expect(result.reasons.some((r) => r.code === "NPO_FASTING_SATISFIED")).toBe(true);
      expect(result.reasons[0]?.message).toContain("NPO fasting status unsatisfied");
    });
  });

  describe("anesthesiaMinutes", () => {
    it("returns elapsed minutes between sedation start and end", () => {
      const start = "2026-10-16T08:00:00.000Z";
      const end = "2026-10-16T08:27:00.000Z";
      expect(anesthesiaMinutes(start, end)).toBe(27);
    });

    it("returns null when sedation start is not provided", () => {
      expect(anesthesiaMinutes(undefined, "2026-10-16T08:27:00.000Z")).toBeNull();
    });

    it("returns 0 if end is before start", () => {
      const start = "2026-10-16T08:30:00.000Z";
      const end = "2026-10-16T08:20:00.000Z";
      expect(anesthesiaMinutes(start, end)).toBe(0);
    });
  });

  describe("evaluateGate2 pre-anesthesia integration", () => {
    const defaultChecks: ReadinessCheck[] = [
      { name: "anesthesia_clearance", label: "Anesthesia clearance", status: "pending" },
      { name: "anticoagulation", label: "Anticoagulation hold", status: "satisfied" },
      { name: "equipment", label: "Equipment readiness", status: "satisfied" },
      { name: "escort", label: "Responsible escort", status: "satisfied" },
    ];

    it("satisfies Gate 2 anesthesia clearance when valid pre-assessment is provided", () => {
      const result = evaluateGate2(defaultChecks, undefined, mockAssessment);
      expect(result.ok).toBe(true);
      const anesCheck = result.checks?.find((c) => c.code === "GATE2_ANESTHESIA");
      expect(anesCheck?.ok).toBe(true);
    });

    it("fails Gate 2 anesthesia clearance when pre-assessment is null", () => {
      const result = evaluateGate2(defaultChecks, undefined, null);
      expect(result.ok).toBe(false);
      const anesCheck = result.checks?.find((c) => c.code === "GATE2_ANESTHESIA");
      expect(anesCheck?.ok).toBe(false);
      const anesReason = result.reasons.find((r) => r.code === "GATE2_ANESTHESIA");
      expect(anesReason?.message).toContain("CMS 42 CFR § 416.42(a)");
    });
  });
});
