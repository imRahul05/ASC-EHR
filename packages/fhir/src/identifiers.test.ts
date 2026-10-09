import { describe, expect, it } from "vitest";

import { caseNumberIdentifier, ecwPatientIdentifier, ecwPatientSystem, formatCaseNumber, mrnIdentifier } from "./identifiers.js";
import { createFhirUrls } from "./urls.js";

describe("eCW patient identifier", () => {
  it("uses the per-practice URN system (docs/product/06 §5.1)", () => {
    expect(ecwPatientSystem("practice-7")).toBe("urn:wybit:ecw:practice-7");
    expect(ecwPatientIdentifier("practice-7", "12345")).toEqual({ system: "urn:wybit:ecw:practice-7", value: "12345" });
  });

  it.each(["", " ", "a b", "-x", "a/b", "x".repeat(65), "é"])("rejects the practice id %j", (practice) => {
    expect(() => ecwPatientSystem(practice)).toThrow("invalid eCW practice id");
  });

  it.each(["", "a b", "tab\t", "x".repeat(65)])("rejects the patient id %j without echoing it", (patientId) => {
    expect(() => ecwPatientIdentifier("p1", patientId)).toThrow("invalid eCW patient id");
    try {
      ecwPatientIdentifier("p1", patientId);
    } catch (error) {
      if (patientId.trim() !== "") expect((error as Error).message).not.toContain(patientId);
    }
  });
});

describe("MRN and case number identifiers", () => {
  it("use systems under the canonical base", () => {
    expect(mrnIdentifier("A100")).toEqual({ system: "https://fhir.wybit.io/asc/identifier/mrn", value: "A100" });
    expect(caseNumberIdentifier("ASC1-20261008-0001")).toEqual({
      system: "https://fhir.wybit.io/asc/identifier/case-number",
      value: "ASC1-20261008-0001",
    });
  });

  it("follow a different base when one is passed", () => {
    const urls = createFhirUrls("https://fhir.example.test/x/");
    expect(mrnIdentifier("A100", urls).system).toBe("https://fhir.example.test/x/identifier/mrn");
  });

  it("reject blank or spaced values and never put the value in the error", () => {
    expect(() => mrnIdentifier("")).toThrow("invalid MRN");
    expect(() => caseNumberIdentifier("a b")).toThrow("invalid case number");
    expect(() => mrnIdentifier("SECRET 1")).not.toThrow("SECRET");
  });
});

describe("formatCaseNumber", () => {
  it("is <facility>-<yyyy>-<seq>, padded to six digits", () => {
    expect(formatCaseNumber({ facilityCode: "ASC1", year: 2026, sequence: 1 })).toBe("ASC1-2026-000001");
    expect(formatCaseNumber({ facilityCode: "ASC1", year: 2099, sequence: 999_999 })).toBe("ASC1-2099-999999");
    expect(formatCaseNumber({ facilityCode: "AB", year: 2000, sequence: 42 })).toBe("AB-2000-000042");
  });

  it("carries the year only, never a month or day", () => {
    expect(formatCaseNumber({ facilityCode: "ASC1", year: 2026, sequence: 7 })).toMatch(/^[A-Z0-9]{2,8}-\d{4}-\d{6}$/);
  });

  it.each([
    [{ facilityCode: "asc1", year: 2026, sequence: 1 }, "invalid facility code"],
    [{ facilityCode: "A", year: 2026, sequence: 1 }, "invalid facility code"],
    [{ facilityCode: "ASC1", year: 1999, sequence: 1 }, "invalid case year"],
    [{ facilityCode: "ASC1", year: 2100, sequence: 1 }, "invalid case year"],
    [{ facilityCode: "ASC1", year: 2026.5, sequence: 1 }, "invalid case year"],
    [{ facilityCode: "ASC1", year: 2026, sequence: 0 }, "invalid case sequence"],
    [{ facilityCode: "ASC1", year: 2026, sequence: 1_000_000 }, "invalid case sequence"],
    [{ facilityCode: "ASC1", year: 2026, sequence: 1.5 }, "invalid case sequence"],
  ])("rejects %j", (parts, message) => {
    expect(() => formatCaseNumber(parts)).toThrow(message);
  });

  it("never echoes the input in its errors", () => {
    expect(() => formatCaseNumber({ facilityCode: "ASC1", year: 1850, sequence: 1 })).toThrow(/^invalid case year$/);
  });
});
