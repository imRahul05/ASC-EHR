import type { Capability, Grant, Principal } from "@asc/types";

export interface AuthzContext {
  readonly facilityId?: string;
  readonly patientId?: string;
  readonly caseId?: string;
}

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

// An AI run only acts on the patient (and case, when set) it was started for.
function withinRunScope(principal: Principal, context: AuthzContext): boolean {
  if (principal.kind === "patient") {
    return context.patientId === undefined || context.patientId === principal.patientId;
  }
  if (principal.kind === "agent") {
    if (context.patientId !== principal.run.patientId) return false;
    return principal.run.caseId === undefined || context.caseId === principal.run.caseId;
  }
  return true;
}

export function can(principal: Principal, capability: Capability, context: AuthzContext = {}): boolean {
  if (principal.kind === "patient" && !isPortalCapability(capability)) return false;
  if (!withinRunScope(principal, context)) return false;
  return applicableGrants(principal, context.facilityId).some((grant) => grant.capabilities.includes(capability));
}
