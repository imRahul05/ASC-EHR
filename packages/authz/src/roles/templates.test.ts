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

  it("lets every staff role read the directory and only admin write it", () => {
    for (const template of roleRegistry.all().filter((t) => t.key !== "patient")) {
      for (const type of ["Practitioner", "Organization", "Location"]) {
        const rule = template.data.find((r) => r.resourceType === type);
        expect(rule, `${template.key} ${type}`).toBeDefined();
        expect(rule?.readonly === true, `${template.key} ${type}`).toBe(template.key !== "admin");
      }
    }
  });

  it("never lets a role write PractitionerRole, the role grants capabilities are built from", () => {
    for (const template of roleRegistry.all()) {
      for (const rule of template.data.filter((r) => r.resourceType === "PractitionerRole")) {
        expect(rule.readonly, template.key).toBe(true);
      }
    }
  });

  it("gives Task read-write to working roles and read-only to the auditor", () => {
    const task = (key: string) => roleRegistry.get(key)?.data.find((r) => r.resourceType === "Task");
    for (const key of ["front-desk", "rn", "tech", "gi-physician", "anesthesia", "coder"]) {
      expect(task(key), key).toBeDefined();
      expect(task(key)?.readonly, key).toBeUndefined();
    }
    expect(task("auditor")?.readonly).toBe(true);
    expect(task("admin")).toBeUndefined();
  });

  it("gives every template a unique resource type per rule", () => {
    for (const template of roleRegistry.all()) {
      const types = template.data.map((rule) => rule.resourceType);
      expect(new Set(types).size, template.key).toBe(types.length);
    }
  });

  it("keeps clinical documents away from front-desk and admin", () => {
    for (const key of ["front-desk", "admin"]) {
      const types = roleRegistry.get(key)?.data.map((r) => r.resourceType) ?? [];
      for (const clinical of ["Composition", "QuestionnaireResponse", "MedicationAdministration"]) {
        expect(types, key).not.toContain(clinical);
      }
    }
  });

  it("gives the patient template no staff capability", () => {
    const capabilities = roleRegistry.get("patient")?.capabilities ?? [];
    expect(capabilities.every((c) => c.startsWith("portal."))).toBe(true);
  });
});
