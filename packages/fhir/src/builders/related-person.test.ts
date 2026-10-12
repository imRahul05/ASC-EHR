import { describe, expect, it } from "vitest";
import { buildRelatedPerson } from "./related-person.js";

const base = {
  facilityId: "fac-1",
  patientId: "pat-123",
  relationship: "escort",
} as const;

describe("buildRelatedPerson", () => {
  it("builds a minimal related person resource", () => {
    const person = buildRelatedPerson(base);
    expect(person).toEqual({
      resourceType: "RelatedPerson",
      meta: { accounts: [{ reference: "Organization/fac-1" }] },
      active: true,
      patient: { reference: "Patient/pat-123" },
      relationship: [
        {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/v3-RoleCode",
              code: "escort",
            },
          ],
          text: "escort",
        },
      ],
    });
  });

  it("supports string name and explicit active flag", () => {
    const person = buildRelatedPerson({
      ...base,
      name: "Jane Doe",
      active: false,
    });
    expect(person.active).toBe(false);
    expect(person.name).toEqual([{ text: "Jane Doe" }]);
  });

  it("supports structured object name with family and given", () => {
    const person = buildRelatedPerson({
      ...base,
      name: { family: "Smith", given: ["Alice", "Ann"] },
    });
    expect(person.name).toEqual([
      {
        family: "Smith",
        given: ["Alice", "Ann"],
      },
    ]);
  });

  it("supports structured object name with family and empty/undefined given", () => {
    const person = buildRelatedPerson({
      ...base,
      name: { family: "Johnson", given: [] },
    });
    expect(person.name).toEqual([{ family: "Johnson" }]);

    const personWithoutGiven = buildRelatedPerson({
      ...base,
      name: { family: "Johnson" },
    });
    expect(personWithoutGiven.name).toEqual([{ family: "Johnson" }]);
  });

  it("supports telecom contact points", () => {
    const person = buildRelatedPerson({
      ...base,
      telecom: [
        { system: "phone", value: "(555) 123-4567" },
        { system: "email", value: "escort@example.com" },
      ],
    });
    expect(person.telecom).toEqual([
      { system: "phone", value: "(555) 123-4567" },
      { system: "email", value: "escort@example.com" },
    ]);
  });

  it("ignores empty telecom array", () => {
    const person = buildRelatedPerson({
      ...base,
      telecom: [],
    });
    expect(person.telecom).toBeUndefined();
  });

  it("rejects invalid inputs and protects PHI", () => {
    expect(() => buildRelatedPerson({ ...base, facilityId: "" })).toThrow("invalid facility id");
    expect(() => buildRelatedPerson({ ...base, patientId: "bad/id" })).toThrow("invalid patient id");
    expect(() => buildRelatedPerson({ ...base, patientId: undefined })).toThrow("invalid patient id");
    expect(() => buildRelatedPerson({ ...base, relationship: "   " })).toThrow("invalid relationship");
    expect(() => buildRelatedPerson({ ...base, name: "   " })).toThrow("invalid related person name");
    expect(() => buildRelatedPerson({ ...base, name: { family: "  " } })).toThrow("invalid related person family name");
    expect(() => buildRelatedPerson({ ...base, name: { family: "Doe", given: [""] } })).toThrow(
      "invalid related person given name",
    );
    expect(() => buildRelatedPerson({ ...base, telecom: [{ system: "phone", value: "" }] })).toThrow(
      "invalid telecom value",
    );
  });

  it("supports patientRef and urn:uuid patientId for transactions", () => {
    const withRef = buildRelatedPerson({
      ...base,
      patientId: undefined,
      patientRef: { reference: "urn:uuid:temp-patient-1" },
    });
    expect(withRef.patient).toEqual({ reference: "urn:uuid:temp-patient-1" });

    const withUrn = buildRelatedPerson({
      ...base,
      patientId: "urn:uuid:temp-patient-2",
    });
    expect(withUrn.patient).toEqual({ reference: "urn:uuid:temp-patient-2" });
  });
});
