import type { Capability, Principal } from "@asc/types";
import { can, type AuthzContext } from "./can";

// A workspace is a UI surface (home, nav, dashboard) shown when the principal
// holds at least one of its capabilities. Definitions come from the app (D-A4);
// this package never lists UI. Order = priority: the first match is the default.
export interface WorkspaceDefinition {
  readonly key: string;
  readonly label: string;
  readonly requiresAny: readonly Capability[];
}

export function resolveWorkspaces<T extends WorkspaceDefinition>(
  principal: Principal,
  definitions: readonly T[],
  context: AuthzContext = {},
): T[] {
  return definitions.filter((definition) =>
    definition.requiresAny.some((capability) => can(principal, capability, context)),
  );
}

export function defaultWorkspace<T extends WorkspaceDefinition>(
  principal: Principal,
  definitions: readonly T[],
  context: AuthzContext = {},
): T | undefined {
  return resolveWorkspaces(principal, definitions, context)[0];
}
