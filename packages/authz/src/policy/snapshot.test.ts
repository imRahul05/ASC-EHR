import { describe, expect, it } from "vitest";
import { roleRegistry } from "../roles/index";
import { compilePolicy } from "./compile";

const DIRECTORY_TYPES = new Set(["Practitioner", "PractitionerRole", "Organization", "Location"]);

// Portal (patient) policies are not compiled until P2.
const staffTemplates = roleRegistry.all().filter((template) => template.requiresMfa);

describe("compiled policies", () => {
  it.each(staffTemplates.map((template) => [template.key, template] as const))(
    "%s compiles to a stable AccessPolicy",
    (_key, template) => {
      expect(compilePolicy(template)).toMatchSnapshot();
    },
  );

  it("is deterministic: same input, same bytes, regardless of rule order", () => {
    for (const template of staffTemplates) {
      const first = JSON.stringify(compilePolicy(template));
      expect(JSON.stringify(compilePolicy(template))).toBe(first);
      const reversed = { ...template, data: [...template.data].reverse() };
      expect(JSON.stringify(compilePolicy(reversed))).toBe(first);
    }
  });

  it("never emits a wildcard resource type", () => {
    for (const template of staffTemplates) {
      for (const rule of compilePolicy(template).resource) expect(rule.resourceType).not.toBe("*");
    }
  });

  it("scopes every clinical resource of a facility-scoped policy by facility and no all-site policy", () => {
    for (const template of staffTemplates) {
      for (const rule of compilePolicy(template).resource) {
        if (DIRECTORY_TYPES.has(rule.resourceType)) continue;
        expect(rule.criteria !== undefined, `${template.key} ${rule.resourceType}`).toBe(template.facilityScoped);
      }
    }
  });

  it("never puts a facility filter on directory data, so every role can see practitioners and sites", () => {
    for (const template of staffTemplates) {
      const compiled = compilePolicy(template).resource;
      for (const type of DIRECTORY_TYPES) {
        const rule = compiled.find((r) => r.resourceType === type);
        expect(rule, `${template.key} ${type}`).toBeDefined();
        expect(rule?.criteria, `${template.key} ${type}`).toBeUndefined();
      }
    }
  });

  it("hides Composition from front-desk", () => {
    const frontDesk = roleRegistry.get("front-desk");
    expect(frontDesk).toBeDefined();
    const types = compilePolicy(frontDesk!).resource.map((rule) => rule.resourceType);
    expect(types).not.toContain("Composition");
  });
});
