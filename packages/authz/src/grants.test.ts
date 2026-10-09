import type { RoleTemplate } from "@asc/types";
import { describe, expect, it } from "vitest";
import { can } from "./can.js";
import { buildGrants, grantsFromPractitionerRoles, practitionerRolesToAssignments } from "./grants.js";
import { staffPrincipal } from "./fixtures.js";
import { roleRegistry } from "./roles/index.js";
import { createRoleRegistry } from "./roles/registry.js";


describe("buildGrants", () => {
  it("builds one grant per facility and never merges across facilities", () => {
    const supervisor: RoleTemplate = {
      key: "clinical-supervisor",
      version: 1,
      label: "Clinical supervisor",
      status: "active",
      capabilities: ["note.sign"],
      data: [],
      facilityScoped: true,
      requiresMfa: true,
    };
    const registry = createRoleRegistry([...roleRegistry.all(), supervisor]);
    const grants = buildGrants(
      [
        { roleKey: "rn", facilityId: "A" },
        { roleKey: "rn", facilityId: "B" },
        { roleKey: "clinical-supervisor", facilityId: "B" },
      ],
      registry,
    );
    expect(grants.map((g) => (g.scope === "facility" ? g.facilityId : "all"))).toEqual(["A", "B"]);

    const userX = staffPrincipal(grants);
    expect(can(userX, "note.sign", { facilityId: "A" })).toBe(false);
    expect(can(userX, "note.sign", { facilityId: "B" })).toBe(true);
    expect(can(userX, "case.advance", { facilityId: "A" })).toBe(true);
  });

  it("builds a single all-site grant for unscoped roles and ignores their facility", () => {
    const grants = buildGrants(
      [
        { roleKey: "coder" },
        { roleKey: "auditor", facilityId: "A" },
      ],
      roleRegistry,
    );
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ scope: "all", roleKeys: ["coder", "auditor"] });
    expect(grants[0]?.capabilities).toContain("coding.attest");
    expect(grants[0]?.capabilities).toContain("audit.read");
  });

  it("unions roles held at the same facility and dedupes capabilities", () => {
    const [grant] = buildGrants(
      [
        { roleKey: "rn", facilityId: "A" },
        { roleKey: "tech", facilityId: "A" },
      ],
      roleRegistry,
    );
    expect(grant?.roleKeys).toEqual(["rn", "tech"]);
    const caps = grant?.capabilities ?? [];
    expect(new Set(caps).size).toBe(caps.length);
  });

  it("fails closed on unknown roles, retired roles and missing facilities", () => {
    const retired: RoleTemplate = { ...roleRegistry.get("rn")!, key: "old-rn", status: "retired" };
    const registry = createRoleRegistry([...roleRegistry.all(), retired]);
    expect(
      buildGrants(
        [
          { roleKey: "does-not-exist", facilityId: "A" },
          { roleKey: "old-rn", facilityId: "A" },
          { roleKey: "rn" },
          { roleKey: "rn", facilityId: "" },
        ],
        registry,
      ),
    ).toEqual([]);
  });
});

describe("practitionerRolesToAssignments", () => {
  it("extracts active role assignments with facility references parsed", () => {
    const assignments = practitionerRolesToAssignments([
      {
        active: true,
        code: [{ coding: [{ system: "https://asc-ehr.app/role-template", code: "rn" }] }],
        organization: { reference: "Organization/fac-a" },
      },
      {
        active: true,
        code: [{ coding: [{ system: "https://asc-ehr.app/role-template", code: "coder" }] }],
      },
    ]);
    expect(assignments).toEqual([
      { roleKey: "rn", facilityId: "fac-a" },
      { roleKey: "coder" },
    ]);
  });

  it("extracts multiple role codings present on a single PractitionerRole", () => {
    const assignments = practitionerRolesToAssignments([
      {
        active: true,
        code: [
          {
            coding: [
              { system: "https://asc-ehr.app/role-template", code: "rn" },
              { system: "https://asc-ehr.app/role-template", code: "preop-pacu-rn" },
              { system: "http://example.com/other", code: "other-system" },
            ],
          },
        ],
        organization: { reference: "Organization/fac-c" },
      },
    ]);
    expect(assignments).toEqual([
      { roleKey: "rn", facilityId: "fac-c" },
      { roleKey: "preop-pacu-rn", facilityId: "fac-c" },
    ]);
  });

  it("ignores inactive roles and non-matching coding systems", () => {
    const assignments = practitionerRolesToAssignments([
      {
        active: false,
        code: [{ coding: [{ system: "https://asc-ehr.app/role-template", code: "rn" }] }],
        organization: { reference: "Organization/fac-a" },
      },
      {
        active: true,
        code: [{ coding: [{ system: "http://example.com/other", code: "rn" }] }],
      },
      {
        active: true,
      },
    ]);
    expect(assignments).toEqual([]);
  });
});

describe("grantsFromPractitionerRoles", () => {
  it("maps FHIR roles directly to per-facility grants", () => {
    const grants = grantsFromPractitionerRoles(
      [
        {
          active: true,
          code: [{ coding: [{ system: "https://asc-ehr.app/role-template", code: "rn" }] }],
          organization: { reference: "Organization/fac-a" },
        },
        {
          active: true,
          code: [{ coding: [{ system: "https://asc-ehr.app/role-template", code: "gi-physician" }] }],
          organization: { reference: "Organization/fac-b" },
        },
        {
          active: true,
          code: [{ coding: [{ system: "https://asc-ehr.app/role-template", code: "auditor" }] }],
        },
      ],
      roleRegistry,
    );
    expect(grants.find((g) => g.scope === "facility" && g.facilityId === "fac-a")?.roleKeys).toEqual(["rn"]);
    expect(grants.find((g) => g.scope === "facility" && g.facilityId === "fac-b")?.roleKeys).toEqual(["gi-physician"]);
    expect(grants.find((g) => g.scope === "all")?.roleKeys).toEqual(["auditor"]);
  });

  it("fails closed on inactive or unknown roles", () => {
    const grants = grantsFromPractitionerRoles(
      [
        {
          active: false,
          code: [{ coding: [{ system: "https://asc-ehr.app/role-template", code: "rn" }] }],
          organization: { reference: "Organization/fac-a" },
        },
        {
          active: true,
          code: [{ coding: [{ system: "https://asc-ehr.app/role-template", code: "unknown-role" }] }],
          organization: { reference: "Organization/fac-a" },
        },
      ],
      roleRegistry,
    );
    expect(grants).toEqual([]);
  });
});

