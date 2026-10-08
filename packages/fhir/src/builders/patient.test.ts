import { describe, expect, it } from "vitest";

import { buildPatient } from "./patient.js";
import { createFhirUrls } from "../urls.js";

const base = { facilityId: "fac-1", name: { family: "Canary-Name", given: ["Test"] } } as const;

describe("buildPatient", () => {
  it("builds a minimal patient of one facility", () => {
    expect(buildPatient(base)).toEqual({
      resourceType: "Patient",
      meta: { accounts: [{ reference: "Organization/fac-1" }] },
      name: [{ family: "Canary-Name", given: ["Test"] }],
    });
  });

  it("adds birth date, gender, MRN and the eCW id when given", () => {
    const patient = buildPatient({ ...base, birthDate: "1970-01-31", gender: "other", mrn: "M-1", ecw: { practice: "p1", patientId: "99" } });
    expect(patient).toMatchObject({ birthDate: "1970-01-31", gender: "other" });
    expect(patient.identifier).toEqual([
      { system: "https://fhir.wybit.io/asc/identifier/mrn", value: "M-1" },
      { system: "urn:wybit:ecw:p1", value: "99" },
    ]);
  });

  it("uses the base it is given for identifier systems", () => {
    const patient = buildPatient({ ...base, mrn: "M-1" }, createFhirUrls("https://fhir.example.test/x/"));
    expect(patient.identifier?.[0]?.system).toBe("https://fhir.example.test/x/identifier/mrn");
  });

  it("rejects a missing facility, a bad name, birth date or id, and never echoes the value", () => {
    expect(() => buildPatient({ ...base, facilityId: "" })).toThrow("invalid facility id");
    expect(() => buildPatient({ ...base, name: { family: " ", given: ["A"] } })).toThrow("invalid patient family name");
    expect(() => buildPatient({ ...base, name: { family: "A", given: [] } })).toThrow("invalid patient given name");
    expect(() => buildPatient({ ...base, name: { family: "A", given: [""] } })).toThrow("invalid patient given name");
    expect(() => buildPatient({ ...base, birthDate: "1970-02-30" })).toThrow("invalid patient birth date");
    expect(() => buildPatient({ ...base, mrn: "bad value" })).toThrow("invalid MRN");
    expect(() => buildPatient({ ...base, birthDate: "SECRET-DOB" })).not.toThrow("SECRET");
  });
});
