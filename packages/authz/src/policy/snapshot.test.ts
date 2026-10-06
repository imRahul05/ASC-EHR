import { describe, expect, it } from "vitest";
import { roleRegistry } from "../roles/index.js";
import { compilePolicy } from "./compile.js";

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

  it("scopes every facility-scoped policy by facility and no all-site policy", () => {
    for (const template of staffTemplates) {
      for (const rule of compilePolicy(template).resource) {
        expect(rule.criteria !== undefined).toBe(template.facilityScoped);
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
