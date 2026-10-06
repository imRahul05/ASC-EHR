import type { Capability, Grant, Principal, RoleKey } from "@asc/types";

export interface AuthzContext {
  readonly facilityId?: string;
  readonly patientId?: string;
  readonly caseId?: string;
}

// Gate numbers follow 08 §6: 3 = facility, 4 = capability (+ run scope).
export type DenyGate = 3 | 4;

export type DenyReason =
  | "no-grant-at-facility"
  | "capability-not-granted"
  | "outside-run-scope"
  | "patient-capability-not-portal";

export type AuthzDecision =
  | { readonly allowed: true; readonly roleKeys: readonly RoleKey[] }
  | { readonly allowed: false; readonly gate: DenyGate; readonly reason: DenyReason };

// Grants that apply at the target. Facility grants only count when the target
// names that exact facility; without a facilityId only all-site grants count
// (fail closed). Capabilities are never merged across facilities.
export function applicableGrants(principal: Principal, facilityId?: string): Grant[] {
  return principal.grants.filter(
    (grant) => grant.scope === "all" || (facilityId !== undefined && grant.facilityId === facilityId),
  );
}

// A patient only ever acts on their own portal; a forged staff grant on a
// patient principal is ignored.
export function isPortalCapability(capability: Capability): boolean {
  return capability.startsWith("portal.");
}

// A patient acts on their own record; an AI run only on the patient (and
// case, when set) it was started for.
function withinScope(principal: Principal, context: AuthzContext): boolean {
  if (principal.kind === "patient") {
    return context.patientId === undefined || context.patientId === principal.patientId;
  }
  if (principal.kind === "agent") {
    if (context.patientId !== principal.run.patientId) return false;
    return principal.run.caseId === undefined || context.caseId === principal.run.caseId;
  }
  return true;
}

export function authorize(principal: Principal, capability: Capability, context: AuthzContext = {}): AuthzDecision {
  const grants = applicableGrants(principal, context.facilityId);
  if (grants.length === 0) return { allowed: false, gate: 3, reason: "no-grant-at-facility" };

  if (principal.kind === "patient" && !isPortalCapability(capability)) {
    return { allowed: false, gate: 4, reason: "patient-capability-not-portal" };
  }
  if (!withinScope(principal, context)) return { allowed: false, gate: 4, reason: "outside-run-scope" };

  const matching = grants.filter((grant) => grant.capabilities.includes(capability));
  if (matching.length === 0) return { allowed: false, gate: 4, reason: "capability-not-granted" };
  return { allowed: true, roleKeys: [...new Set(matching.flatMap((grant) => grant.roleKeys))] };
}

export function can(principal: Principal, capability: Capability, context: AuthzContext = {}): boolean {
  return authorize(principal, capability, context).allowed;
}
