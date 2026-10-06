import { describe, expect, it } from "vitest";
import { ROLE_TEMPLATES, roleRegistry } from "./index.js";

describe("role templates", () => {
  it("load into the registry (valid keys, versions, capabilities)", () => {
    expect(roleRegistry.all()).toHaveLength(ROLE_TEMPLATES.length);
  });

  it("hides Composition from front-desk by omission", () => {
    const frontDesk = roleRegistry.get("front-desk");
    expect(frontDesk?.data.some((rule) => rule.resourceType === "Composition")).toBe(false);
  });

  it("makes front-desk, rn and tech facility-scoped with MFA", () => {
    for (const key of ["front-desk", "rn", "tech"]) {
      expect(roleRegistry.get(key)).toMatchObject({ facilityScoped: true, requiresMfa: true, status: "active" });
    }
  });
});
