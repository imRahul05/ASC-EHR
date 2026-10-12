import { describe, expect, it } from "vitest";
import { registerPatientSchema } from "./register.js";

describe("registerPatientSchema", () => {
  const validPayload = {
    name: {
      family: "Doe",
      given: ["John"],
    },
    dateOfBirth: "1980-05-15",
    gender: "male" as const,
    phone: "(555) 123-4567",
    email: "john.doe@example.com",
    address: {
      line: ["123 Main St"],
      city: "Springfield",
      state: "IL",
      postalCode: "62701",
    },
    mrn: "MRN-1001",
    insurance: {
      payerId: "PAYER-001",
      planName: "Blue Choice PPO",
      memberId: "MEM-9988",
      groupNumber: "GRP-123",
      relationship: "self" as const,
    },
    escort: {
      name: "Jane Doe",
      phone: "(555) 987-6543",
      relationship: "spouse",
    },
    facilityId: "fac-1",
  };

  it("accepts a complete valid registration payload", () => {
    const result = registerPatientSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name.family).toBe("Doe");
      expect(result.data.name.given).toEqual(["John"]);
      expect(result.data.gender).toBe("male");
      expect(result.data.dateOfBirth).toBe("1980-05-15");
    }
  });

  it("accepts given name as a single string and transforms to an array", () => {
    const payload = {
      ...validPayload,
      name: {
        family: "Smith",
        given: "Alice",
      },
    };
    const result = registerPatientSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name.given).toEqual(["Alice"]);
    }
  });

  it("accepts minimal payload without optional fields", () => {
    const minimalPayload = {
      name: {
        family: "Minimal",
        given: ["Patient"],
      },
      dateOfBirth: "1995-12-01",
      gender: "female" as const,
      phone: "555-555-5555",
    };
    const result = registerPatientSchema.safeParse(minimalPayload);
    expect(result.success).toBe(true);
  });

  it("rejects future date of birth", () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const result = registerPatientSchema.safeParse({
      ...validPayload,
      dateOfBirth: futureDate,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date of birth format", () => {
    const result = registerPatientSchema.safeParse({
      ...validPayload,
      dateOfBirth: "05/15/1980",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing family name", () => {
    const result = registerPatientSchema.safeParse({
      ...validPayload,
      name: {
        family: "",
        given: ["John"],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty given name array", () => {
    const result = registerPatientSchema.safeParse({
      ...validPayload,
      name: {
        family: "Doe",
        given: [],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid phone number", () => {
    const result = registerPatientSchema.safeParse({
      ...validPayload,
      phone: "abc",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email address", () => {
    const result = registerPatientSchema.safeParse({
      ...validPayload,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty email string", () => {
    const result = registerPatientSchema.safeParse({
      ...validPayload,
      email: "",
    });
    expect(result.success).toBe(true);
  });
});
