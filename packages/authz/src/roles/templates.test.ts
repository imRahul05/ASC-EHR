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

  it("locks signed Composition for gi-physician and leaves it read-only for anesthesia", () => {
    const composition = (key: string) =>
      roleRegistry.get(key)?.data.find((rule) => rule.resourceType === "Composition");
    expect(composition("gi-physician")).toMatchObject({ lockWhenFinal: true });
    expect(composition("gi-physician")?.readonly).toBeUndefined();
    expect(composition("anesthesia")).toMatchObject({ readonly: true });
  });

  it("signs notes only as gi-physician or anesthesia", () => {
    const signers = roleRegistry
      .all()
      .filter((template) => template.capabilities.includes("note.sign"))
      .map((template) => template.key);
    expect(signers).toEqual(["gi-physician", "anesthesia"]);
  });

  it("makes every staff template so far facility-scoped with MFA", () => {
    for (const key of ["front-desk", "rn", "tech", "gi-physician", "anesthesia"]) {
      expect(roleRegistry.get(key)).toMatchObject({ facilityScoped: true, requiresMfa: true, status: "active" });
    }
  });
});
