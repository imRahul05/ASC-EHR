import { describe, expect, it } from "vitest";
import * as auth from "./auth.js";
import { accessRequestSchema, loginSchema } from "./auth.js";

describe("loginSchema", () => {
  it("needs a valid email and a password of at least 6 characters", () => {
    expect(loginSchema.safeParse({ email: "a@b.org", password: "secret1" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "nope", password: "secret1" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.org", password: "12345" }).success).toBe(false);
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

describe("auth schemas", () => {
  it("export no role enum or role-keyed signup schema", () => {
    expect(Object.keys(auth).sort()).toEqual(["accessRequestSchema", "loginSchema"]);
  });
});
