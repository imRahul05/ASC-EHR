import { describe, expect, it } from "vitest";
import { buildSearchPayload, patientSearchQuerySchema } from "./search.js";

describe("patientSearchQuerySchema", () => {
  it("parses valid query parameters", () => {
    const result = patientSearchQuerySchema.safeParse({
      mrn: "MRN-1234",
      name: "Doe",
      dob: "1980-05-15",
      facilityId: "fac-1",
      limit: "15",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mrn).toBe("MRN-1234");
      expect(result.data.name).toBe("Doe");
      expect(result.data.dob).toBe("1980-05-15");
      expect(result.data.facilityId).toBe("fac-1");
      expect(result.data.limit).toBe(15);
    }
  });

  it("applies default limit when not provided", () => {
    const result = patientSearchQuerySchema.safeParse({ name: "Smith" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
    }
  });

  it("rejects invalid dob format", () => {
    const result = patientSearchQuerySchema.safeParse({ dob: "not-a-date" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid facilityId format", () => {
    const result = patientSearchQuerySchema.safeParse({ facilityId: "fac_bad" });
    expect(result.success).toBe(false);
  });

  it("rejects mrn with spaces", () => {
    const result = patientSearchQuerySchema.safeParse({ mrn: "MRN 123" });
    expect(result.success).toBe(false);
  });
});

describe("buildSearchPayload", () => {
  it("disambiguates valid ISO dates into dob", () => {
    const payload = buildSearchPayload("1985-04-12", "fac-1");
    expect(payload).toEqual({ dob: "1985-04-12", facilityId: "fac-1" });
  });

  it("disambiguates MRN strings into mrn", () => {
    const payload = buildSearchPayload("MRN-204313", "fac-1");
    expect(payload).toEqual({ mrn: "MRN-204313", facilityId: "fac-1" });
  });

  it("disambiguates alphabetic strings into patient name", () => {
    const payload = buildSearchPayload("Jane Doe", "fac-1");
    expect(payload).toEqual({ name: "Jane Doe", facilityId: "fac-1" });
  });

  it("handles null or undefined facilityId properly", () => {
    const payload = buildSearchPayload("Smith", null);
    expect(payload).toEqual({ name: "Smith", facilityId: undefined });
  });
});
