import { describe, expect, it } from "vitest";
import { hpOverrideSchema, hpUpdateNoteSchema } from "./hp.js";

describe("hpUpdateNoteSchema", () => {
  const validUpdateNote = {
    caseId: "case-123",
    facilityId: "fac-456",
    attestation: "I have examined the patient today and confirm no interval change in cardiopulmonary status.",
    noIntervalChange: true,
    cardiovascularStatus: "Normal rate, regular rhythm, no murmurs",
    pulmonaryStatus: "Clear to auscultation bilaterally",
    airwayStatus: "Mallampati II, normal neck mobility",
  };

  it("validates valid day-of interval update note payload", () => {
    const result = hpUpdateNoteSchema.safeParse(validUpdateNote);
    expect(result.success).toBe(true);
  });

  it("fails if attestation is shorter than 10 characters", () => {
    const result = hpUpdateNoteSchema.safeParse({
      ...validUpdateNote,
      attestation: "No change",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("at least 10 characters");
    }
  });

  it("fails if noIntervalChange is false or not true", () => {
    const result = hpUpdateNoteSchema.safeParse({
      ...validUpdateNote,
      noIntervalChange: false,
    });
    expect(result.success).toBe(false);
  });

  it("fails if cardiovascularStatus or pulmonaryStatus is missing", () => {
    const result = hpUpdateNoteSchema.safeParse({
      ...validUpdateNote,
      cardiovascularStatus: "",
    });
    expect(result.success).toBe(false);
  });

  it("fails on invalid FHIR ID for caseId or facilityId", () => {
    const result = hpUpdateNoteSchema.safeParse({
      ...validUpdateNote,
      caseId: "invalid/case/id",
    });
    expect(result.success).toBe(false);
  });
});

describe("hpOverrideSchema", () => {
  const validOverride = {
    caseId: "case-123",
    facilityId: "fac-456",
    overrideReason: "Patient evaluated in clinic 33 days ago; condition stable; day-of focused exam confirms clinical suitability.",
    role: "attending-physician" as const,
  };

  it("validates valid physician override payload", () => {
    const result = hpOverrideSchema.safeParse(validOverride);
    expect(result.success).toBe(true);
  });

  it("validates medical-director role", () => {
    const result = hpOverrideSchema.safeParse({
      ...validOverride,
      role: "medical-director",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-physician role (e.g. nurse, front-desk)", () => {
    const result = hpOverrideSchema.safeParse({
      ...validOverride,
      role: "nurse",
    });
    expect(result.success).toBe(false);
  });

  it("rejects overrideReason shorter than 10 characters", () => {
    const result = hpOverrideSchema.safeParse({
      ...validOverride,
      overrideReason: "too short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("at least 10 characters");
    }
  });
});
