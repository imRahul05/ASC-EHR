import { describe, expect, it } from "vitest";
import { anticoagulationAssessmentSchema } from "./anticoagulation.js";

describe("anticoagulationAssessmentSchema", () => {
  const validAssessment = {
    caseId: "case-123",
    facilityId: "fac-456",
    hasAnticoagulants: true,
    procedureBleedingRisk: "high" as const,
    medications: [
      {
        medicationId: "med-apix",
        medicationName: "Apixaban (Eliquis) 5mg",
        drugClass: "doac" as const,
        prescriberInstructionDate: "2026-10-10",
        prescriberInstruction: "Hold 48 hours prior to procedure",
        prescriberName: "Dr. Cardiology",
        patientConfirmedHeld: true,
        lastDoseTakenAt: "2026-10-13T08:00:00Z",
      },
    ],
  };

  it("validates valid anticoagulation assessment with active medications", () => {
    const result = anticoagulationAssessmentSchema.safeParse(validAssessment);
    expect(result.success).toBe(true);
  });

  it("validates assessment with no anticoagulants", () => {
    const result = anticoagulationAssessmentSchema.safeParse({
      caseId: "case-123",
      facilityId: "fac-456",
      hasAnticoagulants: false,
      procedureBleedingRisk: "low",
      medications: [],
    });
    expect(result.success).toBe(true);
  });

  it("fails if hasAnticoagulants is omitted", () => {
    const { hasAnticoagulants: _, ...invalid } = validAssessment;
    const result = anticoagulationAssessmentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("fails on invalid procedureBleedingRisk", () => {
    const result = anticoagulationAssessmentSchema.safeParse({
      ...validAssessment,
      procedureBleedingRisk: "extreme",
    });
    expect(result.success).toBe(false);
  });

  it("fails on invalid FHIR ID for caseId or facilityId", () => {
    const result = anticoagulationAssessmentSchema.safeParse({
      ...validAssessment,
      caseId: "bad/id/here",
    });
    expect(result.success).toBe(false);
  });
});
