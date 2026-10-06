"use client";

import { useAuthStore } from "../lib/stores/auth.store";
import { workspacesFor } from "../lib/workspaces";

/**
 * Workspaces available to the signed-in user at the current facility, and the effective one:
 * the picked workspace while it is still available, otherwise the first by priority.
 * Null current = the user's capabilities match no workspace (show nothing, fail closed).
 */
export function useWorkspace() {
  const principal = useAuthStore((state) => state.principal);
  const facilityId = useAuthStore((state) => state.facilityId);
  const picked = useAuthStore((state) => state.workspaceKey);
  const select = useAuthStore((state) => state.selectWorkspace);

  const workspaces = workspacesFor(principal, facilityId);
  const current = workspaces.find((workspace) => workspace.key === picked) ?? workspaces[0] ?? null;
  return { workspaces, current, select };
}
