import { describe, expect, it } from "vitest";
import { preopAssessmentSchema, type PreopAssessmentInput } from "./preop.js";

const validPreopPayload: PreopAssessmentInput = {
  caseId: "case-123",
  facilityId: "facility-main",
  vitals: {
    sbp: 120,
    dbp: 80,
    hr: 72,
    rr: 16,
    spo2: 99,
    tempC: 36.8,
    heightInches: 68,
    weightLbs: 165,
  },
  iv: {
    site: "left_forearm",
    gauge: 20,
    attempts: 1,
  },
  npo: {
    solidFoodHoursAgo: 8,
    clearLiquidsHoursAgo: 3,
    confirmed: true,
  },
  escort: {
    name: "Jane Doe",
    phone: "+15551234567",
    relationship: "Spouse",
    confirmedPresent: true,
  },
  allergiesReviewed: true,
  belongingsSecured: true,
};

describe("preopAssessmentSchema", () => {
  it("accepts valid preop intake assessment", () => {
    const result = preopAssessmentSchema.safeParse(validPreopPayload);
    expect(result.success).toBe(true);
  });

  it("rejects physiological out-of-bounds vitals", () => {
    // SBP < 50
    expect(
      preopAssessmentSchema.safeParse({
        ...validPreopPayload,
        vitals: { ...validPreopPayload.vitals, sbp: 45 },
      }).success,
    ).toBe(false);

    // SBP > 300
    expect(
      preopAssessmentSchema.safeParse({
        ...validPreopPayload,
        vitals: { ...validPreopPayload.vitals, sbp: 320 },
      }).success,
    ).toBe(false);

    // DBP < 30
    expect(
      preopAssessmentSchema.safeParse({
        ...validPreopPayload,
        vitals: { ...validPreopPayload.vitals, dbp: 25 },
      }).success,
    ).toBe(false);

    // DBP > 200
    expect(
      preopAssessmentSchema.safeParse({
        ...validPreopPayload,
        vitals: { ...validPreopPayload.vitals, dbp: 210 },
      }).success,
    ).toBe(false);

    // SpO2 < 50 or > 100
    expect(
      preopAssessmentSchema.safeParse({
        ...validPreopPayload,
        vitals: { ...validPreopPayload.vitals, spo2: 40 },
      }).success,
    ).toBe(false);
    expect(
      preopAssessmentSchema.safeParse({
        ...validPreopPayload,
        vitals: { ...validPreopPayload.vitals, spo2: 105 },
      }).success,
    ).toBe(false);

    // HR out of bounds
    expect(
      preopAssessmentSchema.safeParse({
        ...validPreopPayload,
        vitals: { ...validPreopPayload.vitals, hr: 25 },
      }).success,
    ).toBe(false);

    // RR out of bounds
    expect(
      preopAssessmentSchema.safeParse({
        ...validPreopPayload,
        vitals: { ...validPreopPayload.vitals, rr: 4 },
      }).success,
    ).toBe(false);
  });

  it("rejects non-standard IV gauge and invalid sites", () => {
    expect(
      preopAssessmentSchema.safeParse({
        ...validPreopPayload,
        iv: { ...validPreopPayload.iv, gauge: 16 },
      }).success,
    ).toBe(false);

    expect(
      preopAssessmentSchema.safeParse({
        ...validPreopPayload,
        iv: { ...validPreopPayload.iv, site: "foot" },
      }).success,
    ).toBe(false);

    expect(
      preopAssessmentSchema.safeParse({
        ...validPreopPayload,
        iv: { ...validPreopPayload.iv, attempts: 0 },
      }).success,
    ).toBe(false);
  });

  it("rejects negative NPO hours", () => {
    expect(
      preopAssessmentSchema.safeParse({
        ...validPreopPayload,
        npo: { ...validPreopPayload.npo, solidFoodHoursAgo: -1 },
      }).success,
    ).toBe(false);
  });

  it("rejects non-numeric or invalid phone format for escort", () => {
    expect(
      preopAssessmentSchema.safeParse({
        ...validPreopPayload,
        escort: { ...validPreopPayload.escort, phone: "invalid-phone" },
      }).success,
    ).toBe(false);

    expect(
      preopAssessmentSchema.safeParse({
        ...validPreopPayload,
        escort: { ...validPreopPayload.escort, phone: "123" },
      }).success,
    ).toBe(false);
  });

  it("rejects when allergiesReviewed is false or missing", () => {
    expect(
      preopAssessmentSchema.safeParse({
        ...validPreopPayload,
        allergiesReviewed: false,
      }).success,
    ).toBe(false);

    const { allergiesReviewed: _, ...missingAllergies } = validPreopPayload;
    expect(preopAssessmentSchema.safeParse(missingAllergies).success).toBe(false);
  });
});
