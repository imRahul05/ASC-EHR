import { describe, expect, it } from "vitest";
import { accessRequestSchema, SIGNUP_ROLE_FIELDS, signupSchema, userRoleSchema } from "./auth.js";

const base = { fullName: "Test User", email: "test@example.org", password: "Password@123" };

function issuePaths(input: unknown): string[] {
  const result = signupSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => String(issue.path[0]));
}

describe("signupSchema (driven by SIGNUP_ROLE_FIELDS)", () => {
  it("has a field list for every role", () => {
    for (const role of userRoleSchema.options) expect(SIGNUP_ROLE_FIELDS[role]).toBeDefined();
  });

  it.each(userRoleSchema.options)("requires exactly the %s fields marked required", (role) => {
    const required = SIGNUP_ROLE_FIELDS[role].filter((rule) => rule.requiredMessage).map((rule) => rule.field);
    expect(issuePaths({ ...base, role }).sort()).toEqual([...required].sort());
  });

  it("rejects an NPI that is not 10 digits for clinicians", () => {
    expect(issuePaths({ ...base, role: "SURGEON", npi: "123", licenseNumber: "MD-1" })).toEqual(["npi"]);
  });

  it("accepts a complete patient signup", () => {
    const patient = { ...base, role: "PATIENT", dateOfBirth: "1960-01-01", escortName: "A Driver", escortPhone: "555" };
    expect(signupSchema.safeParse(patient).success).toBe(true);
  });

  it("treats whitespace-only values as missing", () => {
    expect(issuePaths({ ...base, role: "ADMIN", facilityCode: "   " })).toEqual(["facilityCode"]);
  });
});

describe("accessRequestSchema", () => {
  const request = { fullName: "Jordan Reyes", email: "jordan@example.org" };

  it("accepts a name and email, with the facility code optional", () => {
    expect(accessRequestSchema.safeParse(request).success).toBe(true);
    expect(accessRequestSchema.safeParse({ ...request, facilityCode: " ASC-1 " }).data?.facilityCode).toBe("ASC-1");
  });

  it("rejects a short name or an invalid email", () => {
    expect(accessRequestSchema.safeParse({ ...request, fullName: "J" }).success).toBe(false);
    expect(accessRequestSchema.safeParse({ ...request, email: "not-an-email" }).success).toBe(false);
  });

  it("carries no role: a role in the input is dropped, never granted", () => {
    const parsed = accessRequestSchema.safeParse({ ...request, role: "ADMIN", password: "x" });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(request);
  });
});
