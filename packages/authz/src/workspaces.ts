import type { Capability, Principal, RoleKey } from "@asc/types";
import { applicableGrants, can, type AuthzContext } from "@asc/authz/can";

// A workspace is a UI surface (home, nav, dashboard) shown when the principal
// holds at least one of its capabilities or active roles. Definitions come from the app (D-A4);
// this package never lists UI. Order = priority: the first match is the default.
export interface WorkspaceDefinition {
  readonly key: string;
  readonly label: string;
  readonly requiresAny: readonly Capability[];
  readonly requiresRoleAny?: readonly RoleKey[];
}

export function resolveWorkspaces<T extends WorkspaceDefinition>(
  principal: Principal,
  definitions: readonly T[],
  context: AuthzContext = {},
): T[] {
  const grants = applicableGrants(principal, context.facilityId);
  const activeRoles = new Set(grants.flatMap((grant) => grant.roleKeys));

  return definitions.filter((definition) => {
    const hasCapability = definition.requiresAny.some((capability) => can(principal, capability, context));
    const hasRole = definition.requiresRoleAny?.some((roleKey) => activeRoles.has(roleKey)) ?? false;
    return hasCapability || hasRole;
  });
}

export function defaultWorkspace<T extends WorkspaceDefinition>(
  principal: Principal,
  definitions: readonly T[],
  context: AuthzContext = {},
): T | undefined {
  return resolveWorkspaces(principal, definitions, context)[0];
}
