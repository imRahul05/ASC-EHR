import { resolveWorkspaces } from "@asc/authz/workspaces";
import type { Principal } from "@asc/types";

/**
 * Workspaces: what a user lands on and how the shell is labelled (D-A4). A user sees a
 * workspace when they hold one of its capabilities at the current facility; order is
 * priority (the first match is the default). Adding a role that needs its own screen is a
 * new entry here plus its dashboard in features/dashboard/dashboard-config.tsx.
 */
export const WORKSPACES = [
  { key: "anesthesia", label: "Anesthesia", requiresAny: ["anesthesia.document"], home: "/dashboard", navTitles: {} },
  { key: "physician", label: "Physician", requiresAny: ["note.draft"], home: "/dashboard", navTitles: { worklist: "Sign queue" } },
  { key: "nursing", label: "Nursing", requiresAny: ["pacu.document"], home: "/dashboard", navTitles: {} },
  { key: "operations", label: "Center operations", requiresAny: ["schedule.manage", "admin.users"], home: "/dashboard", navTitles: {} },
  { key: "patient", label: "Patient portal", requiresAny: ["portal.self.read"], home: "/my-care", navTitles: {} },
] as const;

/** Workspaces the principal can use at a facility, in priority order. Empty means none. */
export function workspacesFor(principal: Principal | null, facilityId: string | null) {
  if (principal === null) return [];
  return resolveWorkspaces(principal, WORKSPACES, { facilityId: facilityId ?? undefined });
}
