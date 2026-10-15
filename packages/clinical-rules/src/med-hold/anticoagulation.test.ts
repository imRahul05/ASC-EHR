import { describe, expect, it } from "vitest";
import type { Medication } from "@asc/types";
import { evaluateAnticoagulationHold } from "./anticoagulation";

describe("evaluateAnticoagulationHold (ASGE 2022)", () => {
  const baseMedication: Medication = {
    id: "med-1",
    name: "Lisinopril",
    dose: "10mg",
    frequency: "Daily",
    medClass: "other",
    holdRule: null,
    holdStatus: "not_required",
  };

  it("returns status: satisfied and hasAnticoagulants: false when patient has no anticoagulants/antiplatelets", () => {
    const result = evaluateAnticoagulationHold({
      medications: [baseMedication],
      procedureBleedingRisk: "high",
    });

    expect(result.status).toBe("satisfied");
    expect(result.hasAnticoagulants).toBe(false);
    expect(result.recommendations).toHaveLength(0);
  });

  it("recommends 48h hold (ASGE-2022-v1) for Apixaban in high-risk procedure (Polypectomy)", () => {
    const apixaban: Medication = {
      id: "med-apix",
      name: "Apixaban (Eliquis)",
      dose: "5mg",
      frequency: "BID",
      medClass: "anticoagulant",
      holdRule: null,
      holdStatus: "pending",
    };

    const result = evaluateAnticoagulationHold({
      medications: [apixaban],
      procedureBleedingRisk: "high",
    });

    expect(result.hasAnticoagulants).toBe(true);
    expect(result.recommendations).toHaveLength(1);
    const rec = result.recommendations[0]!;
    expect(rec.drugClass).toBe("doac");
    expect(rec.recommendedHoldHours).toBe(48);
    expect(rec.ruleVersion).toBe("ASGE-2022-v1");
    expect(rec.recommendationText).toContain("48 hours");
  });

  it("recommends 5 days hold with target INR < 1.5 for Warfarin in high-risk procedure", () => {
    const warfarin: Medication = {
      id: "med-warf",
      name: "Warfarin (Coumadin)",
      dose: "5mg",
      frequency: "Daily",
      medClass: "anticoagulant",
      holdRule: null,
      holdStatus: "pending",
    };

    const result = evaluateAnticoagulationHold({
      medications: [warfarin],
      procedureBleedingRisk: "high",
    });

    expect(result.hasAnticoagulants).toBe(true);
    expect(result.recommendations).toHaveLength(1);
    const rec = result.recommendations[0]!;
    expect(rec.drugClass).toBe("warfarin");
    expect(rec.recommendedHoldHours).toBe(120); // 5 days = 120h
    expect(rec.targetInr).toBe(1.5);
    expect(rec.ruleVersion).toBe("ASGE-2022-v1");
    expect(rec.recommendationText).toContain("INR < 1.5");
  });

  it("recommends 5–7 days hold for Clopidogrel in high-risk procedure", () => {
    const plavix: Medication = {
      id: "med-plavix",
      name: "Clopidogrel (Plavix)",
      dose: "75mg",
      frequency: "Daily",
      medClass: "antiplatelet",
      holdRule: null,
      holdStatus: "pending",
    };

    const result = evaluateAnticoagulationHold({
      medications: [plavix],
      procedureBleedingRisk: "high",
    });

    expect(result.hasAnticoagulants).toBe(true);
    expect(result.recommendations).toHaveLength(1);
    const rec = result.recommendations[0]!;
    expect(rec.drugClass).toBe("p2y12");
    expect(rec.recommendedHoldHours).toBeGreaterThanOrEqual(120); // 5 to 7 days
    expect(rec.recommendationText).toMatch(/5.*7 days|5-7 days/);
  });

  it("continues Aspirin alone for standard screening endoscopy (low bleeding risk) without requiring hold", () => {
    const aspirin: Medication = {
      id: "med-asa",
      name: "Aspirin",
      dose: "81mg",
      frequency: "Daily",
      medClass: "antiplatelet",
      holdRule: null,
      holdStatus: "not_required",
    };

    const result = evaluateAnticoagulationHold({
      medications: [aspirin],
      procedureBleedingRisk: "low",
    });

    expect(result.hasAnticoagulants).toBe(true);
    expect(result.status).toBe("satisfied");
    const rec = result.recommendations[0]!;
    expect(rec.drugClass).toBe("aspirin");
    expect(rec.continueAllowed).toBe(true);
    expect(rec.recommendedHoldHours).toBe(0);
  });

  it("flags check as pending when prescriber hold instruction is missing", () => {
    const apixaban: Medication = {
      id: "med-apix",
      name: "Apixaban",
      dose: "5mg",
      frequency: "BID",
      medClass: "anticoagulant",
      holdRule: null,
      holdStatus: "pending",
    };

    const result = evaluateAnticoagulationHold({
      medications: [apixaban],
      procedureBleedingRisk: "high",
    });

    expect(result.status).toBe("pending");
    expect(result.missingPrescriberInstructions).toContain("med-apix");
    expect(result.message).toContain("Prescriber hold instructions missing");
  });

  it("flags check as pending when prescriber instruction is present but patient day-of hold is unconfirmed", () => {
    const apixaban: Medication = {
      id: "med-apix",
      name: "Apixaban",
      dose: "5mg",
      frequency: "BID",
      medClass: "anticoagulant",
      holdRule: null,
      holdStatus: "pending",
    };

    const result = evaluateAnticoagulationHold({
      medications: [apixaban],
      procedureBleedingRisk: "high",
      assessments: [
        {
          medicationId: "med-apix",
          prescriberInstructionDate: "2026-10-10",
          prescriberInstruction: "Hold 48h prior to procedure",
          patientConfirmedHeld: null, // Not yet verified on day of
        },
      ],
    });

    expect(result.status).toBe("pending");
    expect(result.missingPrescriberInstructions).toHaveLength(0);
    expect(result.unconfirmedPatientHolds).toContain("med-apix");
    expect(result.message).toContain("Patient day-of hold unconfirmed");
  });

  it("returns satisfied when both prescriber instruction and patient day-of hold are confirmed", () => {
    const apixaban: Medication = {
      id: "med-apix",
      name: "Apixaban",
      dose: "5mg",
      frequency: "BID",
      medClass: "anticoagulant",
      holdRule: null,
      holdStatus: "confirmed",
    };

    const result = evaluateAnticoagulationHold({
      medications: [apixaban],
      procedureBleedingRisk: "high",
      assessments: [
        {
          medicationId: "med-apix",
          prescriberInstructionDate: "2026-10-10",
          prescriberInstruction: "Hold 48h prior to procedure",
          patientConfirmedHeld: true,
          lastDoseTakenAt: "2026-10-13T08:00:00Z",
        },
      ],
    });

    expect(result.status).toBe("satisfied");
    expect(result.missingPrescriberInstructions).toHaveLength(0);
    expect(result.unconfirmedPatientHolds).toHaveLength(0);
  });

  it("returns failed when patient confirmed medication was NOT held as instructed", () => {
    const apixaban: Medication = {
      id: "med-apix",
      name: "Apixaban",
      dose: "5mg",
      frequency: "BID",
      medClass: "anticoagulant",
      holdRule: null,
      holdStatus: "not_held",
    };

    const result = evaluateAnticoagulationHold({
      medications: [apixaban],
      procedureBleedingRisk: "high",
      assessments: [
        {
          medicationId: "med-apix",
          prescriberInstructionDate: "2026-10-10",
          prescriberInstruction: "Hold 48h prior to procedure",
          patientConfirmedHeld: false,
        },
      ],
    });

    expect(result.status).toBe("failed");
    expect(result.message).toContain("Patient took medication during recommended hold window");
  });
});
