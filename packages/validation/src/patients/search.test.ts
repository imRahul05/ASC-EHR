import { describe, expect, it } from "vitest";
import { patientSearchQuerySchema } from "./search.js";

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
});
