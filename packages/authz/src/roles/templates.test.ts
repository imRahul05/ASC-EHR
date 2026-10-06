import type { Capability } from "@asc/types";
import { describe, expect, it } from "vitest";
import { ROLE_TEMPLATES, roleRegistry } from "./index.js";

const keysWith = (capability: Capability) =>
  roleRegistry
    .all()
    .filter((template) => template.capabilities.includes(capability))
    .map((template) => template.key);

describe("role templates", () => {
  it("match the D-A7 role list and load into the registry", () => {
    expect(roleRegistry.all().map((t) => t.key)).toEqual([
      "front-desk",
      "rn",
      "tech",
      "gi-physician",
      "anesthesia",
      "coder",
      "admin",
      "auditor",
      "patient",
    ]);
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
    expect(keysWith("note.sign")).toEqual(["gi-physician", "anesthesia"]);
  });

  it("scopes facilities per 08 s7.3: coder, admin, auditor and patient are not facility-scoped", () => {
    const unscoped = roleRegistry
      .all()
      .filter((template) => !template.facilityScoped)
      .map((template) => template.key);
    expect(unscoped).toEqual(["coder", "admin", "auditor", "patient"]);
  });

  it("requires MFA for every staff role and not for patients", () => {
    for (const template of roleRegistry.all()) {
      expect(template.requiresMfa).toBe(template.key !== "patient");
    }
  });

  it("gives the patient template no staff capability", () => {
    const capabilities = roleRegistry.get("patient")?.capabilities ?? [];
    expect(capabilities.every((c) => c.startsWith("portal."))).toBe(true);
  });
});
