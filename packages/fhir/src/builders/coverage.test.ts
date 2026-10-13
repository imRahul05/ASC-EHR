import { describe, expect, it } from "vitest";
import { buildCoverage } from "./coverage.js";

const base = {
  facilityId: "fac-1",
  patientId: "pat-123",
  payorId: "org-456",
  subscriberId: "SUB-789",
} as const;

describe("buildCoverage", () => {
  it("builds a minimal active coverage resource", () => {
    const coverage = buildCoverage(base);
    expect(coverage).toEqual({
      resourceType: "Coverage",
      meta: { accounts: [{ reference: "Organization/fac-1" }] },
      status: "active",
      subscriberId: "SUB-789",
      beneficiary: { reference: "Patient/pat-123" },
      payor: [{ reference: "Organization/org-456" }],
    });
  });

  it("supports custom status, relationship, and group number with plan name", () => {
    const coverage = buildCoverage({
      ...base,
      status: "draft",
      relationship: "spouse",
      groupNumber: "GRP-001",
      planName: "Choice Plus",
    });
    expect(coverage.status).toBe("draft");
    expect(coverage.relationship).toEqual({
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/subscriber-relationship",
          code: "spouse",
        },
      ],
      text: "spouse",
    });
    expect(coverage.class).toEqual([
      {
        type: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/coverage-class",
              code: "group",
            },
          ],
        },
        value: "GRP-001",
        name: "Choice Plus",
      },
    ]);
  });

  it("supports group number without plan name", () => {
    const coverage = buildCoverage({
      ...base,
      groupNumber: "GRP-002",
    });
    expect(coverage.class).toEqual([
      {
        type: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/coverage-class",
              code: "group",
            },
          ],
        },
        value: "GRP-002",
      },
    ]);
  });

  it("supports plan name without group number", () => {
    const coverage = buildCoverage({
      ...base,
      planName: "Standard HMO",
    });
    expect(coverage.class).toEqual([
      {
        type: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/coverage-class",
              code: "plan",
            },
          ],
        },
        value: "Standard HMO",
        name: "Standard HMO",
      },
    ]);
  });

  it("rejects invalid inputs and protects PHI", () => {
    expect(() => buildCoverage({ ...base, facilityId: "" })).toThrow("invalid facility id");
    expect(() => buildCoverage({ ...base, patientId: "bad/id" })).toThrow("invalid patient id");
    expect(() => buildCoverage({ ...base, patientId: undefined })).toThrow("invalid patient id");
    expect(() => buildCoverage({ ...base, payorId: "bad/id" })).toThrow("invalid payor id");
    expect(() => buildCoverage({ ...base, subscriberId: "   " })).toThrow("invalid subscriber id");
    expect(() => buildCoverage({ ...base, groupNumber: "   " })).toThrow("invalid group number");
    expect(() => buildCoverage({ ...base, planName: "   " })).toThrow("invalid plan name");
  });

  it("supports patientRef and urn:uuid patientId for transactions", () => {
    const withRef = buildCoverage({
      ...base,
      patientId: undefined,
      patientRef: { reference: "urn:uuid:temp-patient-1" },
    });
    expect(withRef.beneficiary).toEqual({ reference: "urn:uuid:temp-patient-1" });

    const withUrn = buildCoverage({
      ...base,
      patientId: "urn:uuid:temp-patient-2",
    });
    expect(withUrn.beneficiary).toEqual({ reference: "urn:uuid:temp-patient-2" });
  });
});
