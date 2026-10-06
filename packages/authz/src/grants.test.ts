import type { RoleTemplate } from "@asc/types";
import { describe, expect, it } from "vitest";
import { can } from "./can.js";
import { buildGrants } from "./grants.js";
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
      capabilities: ["case.cancel"],
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
    expect(can(userX, "case.cancel", { facilityId: "A" })).toBe(false);
    expect(can(userX, "case.cancel", { facilityId: "B" })).toBe(true);
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
