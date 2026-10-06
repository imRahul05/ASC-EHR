import { applicableGrants } from "@asc/authz/can";
import { roleRegistry } from "@asc/authz/roles";
import type { Capability, Principal } from "@asc/types";

/** Labels of the roles the principal holds at a facility, from the role templates. */
export function roleLabelsFor(principal: Principal | null, facilityId: string | null): string[] {
  if (principal === null) return [];
  const keys = applicableGrants(principal, facilityId ?? undefined).flatMap((grant) => grant.roleKeys);
  return [...new Set(keys)].flatMap((key) => {
    const template = roleRegistry.get(key);
    return template === undefined ? [] : [template.label];
  });
}

/**
 * Labels of the roles whose templates hold any of the capabilities (null = every role).
 * Used by the help sheet's "who can use this" line, so labels follow the templates.
 */
export function roleLabelsWith(capabilities: readonly Capability[] | null): string[] {
  return roleRegistry
    .all()
    .filter((template) => capabilities === null || template.capabilities.some((capability) => capabilities.includes(capability)))
    .map((template) => template.label);
}
