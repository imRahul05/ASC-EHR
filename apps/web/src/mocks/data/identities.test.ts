import { buildGrants, can, roleRegistry } from "@asc/authz";
import type { Principal } from "@asc/types";
import { describe, expect, it } from "vitest";
import { DEMO_FACILITIES, DEMO_IDENTITIES, DEMO_TENANT } from "./identities";
import { DEMO_PRESETS, MOCK_USER_PROFILES } from "./users";

function staff(email: string): Principal {
  const identity = DEMO_IDENTITIES[email];
  if (identity === undefined) throw new Error(`no identity for ${email}`);
  return {
    kind: "staff",
    id: email,
    membershipId: `membership-${email}`,
    tenant: DEMO_TENANT,
    grants: buildGrants(identity.assignments, roleRegistry),
  };
}

describe("demo identities", () => {
  it("cover every demo user", () => {
    for (const email of Object.keys(MOCK_USER_PROFILES)) expect(DEMO_IDENTITIES[email], email).toBeDefined();
    for (const preset of DEMO_PRESETS) expect(DEMO_IDENTITIES[preset.email], preset.email).toBeDefined();
  });

  it("assign only role keys that exist, at facilities that exist", () => {
    const facilityIds = DEMO_FACILITIES.map((facility) => facility.id) as string[];
    for (const identity of Object.values(DEMO_IDENTITIES)) {
      for (const assignment of identity.assignments) {
        expect(roleRegistry.get(assignment.roleKey)).toBeDefined();
        if (assignment.facilityId !== undefined) expect(facilityIds).toContain(assignment.facilityId);
      }
    }
  });

  it("give the float user different capabilities at each facility", () => {
    const user = staff("float@ascehr.demo");
    expect(can(user, "hp.document", { facilityId: "fac-metro" })).toBe(true);
    expect(can(user, "note.sign", { facilityId: "fac-metro" })).toBe(false);
    expect(can(user, "note.sign", { facilityId: "fac-lakeside" })).toBe(true);
    expect(can(user, "note.sign")).toBe(false);
  });

  it("make the admin persona hold front-desk at Metro plus three all-site roles", () => {
    const admin = staff("admin@ascehr.demo");
    expect(can(admin, "admin.users", { facilityId: "fac-lakeside" })).toBe(true);
    expect(can(admin, "coding.attest", { facilityId: "fac-lakeside" })).toBe(true);
    expect(can(admin, "audit.read")).toBe(true);
    expect(can(admin, "schedule.manage", { facilityId: "fac-metro" })).toBe(true);
    expect(can(admin, "note.sign", { facilityId: "fac-metro" })).toBe(false);
  });

  it("make the surgeon a Metro-only physician", () => {
    const surgeon = staff("surgeon@ascehr.demo");
    expect(can(surgeon, "note.sign", { facilityId: "fac-metro" })).toBe(true);
    expect(can(surgeon, "note.sign", { facilityId: "fac-lakeside" })).toBe(false);
  });
});
