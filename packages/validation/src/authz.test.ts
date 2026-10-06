import { describe, expect, it } from "vitest";
import {
  grantSchema,
  meResponseSchema,
  principalSchema,
  roleTemplateSchema,
} from "./authz.js";

const tenant = { tenantId: "t1", medplumProjectId: "p1" };

describe("authz schemas", () => {
  it("accepts facility and all-site grants", () => {
    expect(
      grantSchema.safeParse({ scope: "facility", facilityId: "A", roleKeys: ["rn"], capabilities: ["case.read"] }).success,
    ).toBe(true);
    expect(grantSchema.safeParse({ scope: "all", roleKeys: ["coder"], capabilities: ["coding.review"] }).success).toBe(true);
  });

  it("rejects a facility grant without facilityId", () => {
    expect(grantSchema.safeParse({ scope: "facility", roleKeys: [], capabilities: [] }).success).toBe(false);
  });

  it("rejects unknown capabilities", () => {
    expect(grantSchema.safeParse({ scope: "all", roleKeys: [], capabilities: ["note.delete"] }).success).toBe(false);
  });

  it("parses every principal kind and rejects unknown kinds", () => {
    const staff = { kind: "staff", id: "u1", membershipId: "m1", tenant, grants: [] };
    const agent = {
      kind: "agent",
      id: "a1",
      agentId: "discharge",
      executionId: "e1",
      onBehalfOf: "u1",
      run: { patientId: "pt1" },
      tenant,
      grants: [],
    };
    expect(principalSchema.safeParse(staff).success).toBe(true);
    expect(principalSchema.safeParse(agent).success).toBe(true);
    expect(principalSchema.safeParse({ ...staff, kind: "admin" }).success).toBe(false);
    const me = { principal: staff, facilities: [{ id: "A", name: "Facility A" }] };
    expect(meResponseSchema.safeParse(me).success).toBe(true);
    expect(meResponseSchema.safeParse({ principal: staff }).success).toBe(false);
    expect(meResponseSchema.safeParse({ ...me, facilities: [{ id: "A" }] }).success).toBe(false);
  });

  it("parses a role template", () => {
    const template = {
      key: "rn",
      version: 1,
      label: "Registered nurse",
      status: "active",
      capabilities: ["case.read"],
      data: [
        { resourceType: "Patient", readonly: true },
        { resourceType: "Location", readonly: true, shared: true },
      ],
      facilityScoped: true,
      requiresMfa: true,
    };
    expect(roleTemplateSchema.safeParse(template).success).toBe(true);
    expect(roleTemplateSchema.safeParse({ ...template, version: 0 }).success).toBe(false);
  });
});
