import type { ResourceRule, RoleTemplate } from "@asc/types";
import type { AccessPolicy, AccessPolicyExpression, AccessPolicyResource } from "./types";

export const ROLE_TEMPLATE_TAG_SYSTEM = "https://asc-ehr.app/role-template";

// A `final` resource can never be overwritten (08 §7.4). %before is Medplum's
// write-constraint variable for the stored version.
export const LOCK_WHEN_FINAL: AccessPolicyExpression = {
  language: "text/fhirpath",
  expression: "%before.exists() implies %before.status != 'final'",
};

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
    // Shared directory data has no facility tag; filtering it would hide it entirely.
    ...(facilityScoped && rule.shared !== true ? { criteria: facilityCriteria(rule.resourceType) } : {}),
    ...(rule.readonly === true ? { readonly: true } : {}),
    ...(rule.hiddenFields?.length ? { hiddenFields: normalizeFields(rule.hiddenFields) } : {}),
    ...(rule.readonlyFields?.length ? { readonlyFields: normalizeFields(rule.readonlyFields) } : {}),
    ...(rule.lockWhenFinal === true ? { writeConstraint: [LOCK_WHEN_FINAL] } : {}),
  };
}

// Sorted and de-duplicated so field order in a template never changes the policy.
function normalizeFields(fields: readonly string[]): string[] {
  return [...new Set(fields)].sort();
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

// One policy per template version, named `<key>-v<version>` and tagged so the
// provisioner can find, upsert and garbage-collect policies by role and version.
export function compilePolicy(template: RoleTemplate): AccessPolicy {
  return {
    resourceType: "AccessPolicy",
    name: `${template.key}-v${template.version}`,
    meta: {
      tag: [{ system: ROLE_TEMPLATE_TAG_SYSTEM, code: template.key, version: String(template.version) }],
    },
    resource: compileResourceRules(template),
  };
}
