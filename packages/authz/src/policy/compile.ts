import type { ResourceRule, RoleTemplate } from "@asc/types";
import type { AccessPolicyResource } from "./types.js";

// The only place that knows how a resource is limited to the member's facility.
// `%facility` is a policy parameter bound per membership (08 §7.4); spike S1
// (P05h) confirms the syntax against Medplum.
export function facilityCriteria(resourceType: string): string {
  return `${resourceType}?_compartment=%facility`;
}

function assertCompilable(template: RoleTemplate): void {
  if (template.capabilities.some((capability) => capability.startsWith("portal."))) {
    throw new Error(`${template.key}: portal policies need a patient-compartment rule (P2) and are not compiled yet`);
  }
  const seen = new Set<string>();
  for (const { resourceType } of template.data) {
    if (resourceType.length === 0 || resourceType === "*") {
      throw new Error(`${template.key}: wildcard or empty resource type is not allowed`);
    }
    if (seen.has(resourceType)) throw new Error(`${template.key}: duplicate rule for ${resourceType}`);
    seen.add(resourceType);
  }
}

function compileRule(rule: ResourceRule, facilityScoped: boolean): AccessPolicyResource {
  return {
    resourceType: rule.resourceType,
    ...(facilityScoped ? { criteria: facilityCriteria(rule.resourceType) } : {}),
    ...(rule.readonly === true ? { readonly: true } : {}),
  };
}

// Facility-scoped roles get facility criteria on every resource; all-site roles
// get none. Resources are sorted so rule order in a template never changes the
// compiled policy.
export function compileResourceRules(template: RoleTemplate): AccessPolicyResource[] {
  assertCompilable(template);
  return template.data
    .map((rule) => compileRule(rule, template.facilityScoped))
    .sort((a, b) => a.resourceType.localeCompare(b.resourceType, "en"));
}
