import type { RoleTemplate } from "@asc/types";
import { describe, expect, it } from "vitest";
import { roleRegistry } from "../roles/index.js";
import {
  compilePolicy,
  compileResourceRules,
  facilityCriteria,
  LOCK_WHEN_FINAL,
  ROLE_TEMPLATE_TAG_SYSTEM,
} from "./compile.js";

const template = (key: string): RoleTemplate => {
  const found = roleRegistry.get(key);
  if (found === undefined) throw new Error(`missing template ${key}`);
  return found;
};

describe("compileResourceRules", () => {
  it("adds facility criteria to every resource of a facility-scoped role", () => {
    const rules = compileResourceRules(template("rn"));
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(rule.criteria).toBe(facilityCriteria(rule.resourceType));
    expect(facilityCriteria("Patient")).toBe("Patient?_compartment=%facility");
  });

  it("adds no facility criteria to all-site roles", () => {
    for (const key of ["coder", "admin", "auditor"]) {
      for (const rule of compileResourceRules(template(key))) expect(rule.criteria).toBeUndefined();
    }
  });

  it("marks read-only rules and leaves writable ones unmarked", () => {
    const byType = Object.fromEntries(compileResourceRules(template("rn")).map((r) => [r.resourceType, r]));
    expect(byType.Patient?.readonly).toBe(true);
    expect(byType.Encounter?.readonly).toBeUndefined();
  });

  it("compiles hidden and readonly fields sorted and de-duplicated, and omits empty lists", () => {
    const rn = template("rn");
    const data = [
      { resourceType: "Patient", hiddenFields: ["telecom", "address", "telecom"], readonlyFields: ["name"] },
      { resourceType: "Encounter", hiddenFields: [], readonlyFields: [] },
    ];
    const [encounter, patient] = compileResourceRules({ ...rn, data });
    expect(patient).toMatchObject({ hiddenFields: ["address", "telecom"], readonlyFields: ["name"] });
    expect(encounter).not.toHaveProperty("hiddenFields");
    expect(encounter).not.toHaveProperty("readonlyFields");
  });

  it("adds the signed-note write constraint to physician Composition only", () => {
    const composition = (key: string) =>
      compileResourceRules(template(key)).find((rule) => rule.resourceType === "Composition");
    expect(composition("gi-physician")?.writeConstraint).toEqual([LOCK_WHEN_FINAL]);
    expect(composition("gi-physician")?.readonly).toBeUndefined();
    expect(composition("anesthesia")?.writeConstraint).toBeUndefined();
    expect(LOCK_WHEN_FINAL.expression).toBe("%before.exists() implies %before.status != 'final'");
  });

  it("omits resources the role does not list: Composition is hidden from front-desk", () => {
    const types = compileResourceRules(template("front-desk")).map((r) => r.resourceType);
    expect(types).not.toContain("Composition");
  });

  it("sorts resources so rule order does not matter", () => {
    const rn = template("rn");
    const shuffled = { ...rn, data: [...rn.data].reverse() };
    expect(compileResourceRules(shuffled)).toEqual(compileResourceRules(rn));
  });

  it("rejects wildcard, empty and duplicate resource types", () => {
    const rn = template("rn");
    expect(() => compileResourceRules({ ...rn, data: [{ resourceType: "*" }] })).toThrow("wildcard");
    expect(() => compileResourceRules({ ...rn, data: [{ resourceType: "" }] })).toThrow("wildcard");
    const dup = [{ resourceType: "Patient" }, { resourceType: "Patient", readonly: true }];
    expect(() => compileResourceRules({ ...rn, data: dup })).toThrow("duplicate");
  });

  it("names and tags a policy by role key and version", () => {
    const policy = compilePolicy({ ...template("gi-physician"), version: 3 });
    expect(policy.resourceType).toBe("AccessPolicy");
    expect(policy.name).toBe("gi-physician-v3");
    expect(policy.meta.tag).toEqual([{ system: ROLE_TEMPLATE_TAG_SYSTEM, code: "gi-physician", version: "3" }]);
    expect(policy.resource.length).toBeGreaterThan(0);
  });

  it("refuses to compile portal roles until the patient compartment rule exists", () => {
    expect(() => compileResourceRules(template("patient"))).toThrow("portal");
  });
});
