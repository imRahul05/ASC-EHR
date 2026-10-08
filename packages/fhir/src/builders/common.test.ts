import { describe, expect, it } from "vitest";

import { facilityMeta, fhirId, instant, isoDate, reference, text } from "./common.js";

describe("fhirId and reference", () => {
  it("accepts what Medplum issues and builds a literal reference", () => {
    expect(fhirId("0a1b-2.c", "x")).toBe("0a1b-2.c");
    expect(reference("Patient", "abc-1")).toEqual({ reference: "Patient/abc-1" });
  });

  it.each(["", "a b", "a/b", "../x", "x".repeat(65), "é"])("rejects %j and does not echo it", (id) => {
    expect(() => reference("Patient", id)).toThrow("invalid Patient id");
    const message = (() => {
      try {
        fhirId(id, "thing");
        return "";
      } catch (error) {
        return (error as Error).message;
      }
    })();
    expect(message).toBe("invalid thing");
  });

  it("names the field when one is given", () => {
    expect(() => reference("Organization", "", "facility id")).toThrow("invalid facility id");
  });
});

describe("facilityMeta", () => {
  it("is the facility account that Medplum's access policy checks", () => {
    expect(facilityMeta("f-1")).toEqual({ accounts: [{ reference: "Organization/f-1" }] });
    expect(() => facilityMeta("")).toThrow("invalid facility id");
  });
});

describe("isoDate", () => {
  it("accepts real calendar dates only", () => {
    expect(isoDate("2026-02-28", "d")).toBe("2026-02-28");
    for (const bad of ["2026-02-30", "2026-13-01", "20260228", "2026-2-8", "", "2026-02-28T00:00:00Z"]) {
      expect(() => isoDate(bad, "date")).toThrow("invalid date");
    }
  });
});

describe("instant", () => {
  it("needs a date, a time and a time zone", () => {
    expect(instant("2026-10-08T09:30:00Z", "t")).toBe("2026-10-08T09:30:00Z");
    expect(instant("2026-10-08T09:30:00.123+05:30", "t")).toBe("2026-10-08T09:30:00.123+05:30");
    for (const bad of ["2026-10-08", "2026-10-08T09:30:00", "2026-10-08T25:61:00Z", "", "yesterday"]) {
      expect(() => instant(bad, "time")).toThrow("invalid time");
    }
  });
});

describe("text", () => {
  it("rejects blank, over-long and control-character text without echoing it", () => {
    expect(text("Ann", "n")).toBe("Ann");
    for (const bad of ["", "   ", "a\nb", "x".repeat(201)]) expect(() => text(bad, "name")).toThrow("invalid name");
    expect(text("x".repeat(10), "n", 10)).toHaveLength(10);
    expect(() => text("x".repeat(11), "n", 10)).toThrow("invalid n");
  });
});
