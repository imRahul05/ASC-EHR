import { describe, expect, it } from "vitest";

import {
  coverageRelationshipSchema,
  coverageSchema,
  patientInsuranceSchema,
} from "./coverage.js";

describe("coverage validation schema", () => {
  it("validates a complete insurance payload", () => {
    const valid = {
      payerId: "payer-123",
      planName: "Choice Plus PPO",
      memberId: "MEM-998877",
      groupNumber: "GRP-001",
      relationship: "self",
    };
    const result = coverageSchema.parse(valid);
    expect(result.payerId).toBe("payer-123");
    expect(result.relationship).toBe("self");
  });

  it("requires payerId and memberId", () => {
    expect(() =>
      coverageSchema.parse({
        payerId: "",
        memberId: "MEM-123",
      }),
    ).toThrow("Payer ID must be a valid FHIR identifier");

    expect(() =>
      coverageSchema.parse({
        payerId: "payer_with_underscore",
        memberId: "MEM-123",
      }),
    ).toThrow("Payer ID must be a valid FHIR identifier");

    expect(() =>
      coverageSchema.parse({
        payerId: "payer-1",
        memberId: "",
      }),
    ).toThrow("Member ID is required");
  });

  it("validates valid relationship enum values", () => {
    expect(coverageRelationshipSchema.parse("self")).toBe("self");
    expect(coverageRelationshipSchema.parse("spouse")).toBe("spouse");
    expect(coverageRelationshipSchema.parse("child")).toBe("child");
    expect(coverageRelationshipSchema.parse("other")).toBe("other");
    expect(() => coverageRelationshipSchema.parse("invalid")).toThrow();
  });

  it("aliases patientInsuranceSchema and coverageSchema", () => {
    expect(patientInsuranceSchema).toBe(coverageSchema);
  });
});
