"use client";

import { can, type AuthzContext } from "@asc/authz/can";
import type { Capability, Principal } from "@asc/types";
import { useAuthStore } from "../lib/stores/auth.store";

/**
 * Capability check against the current facility. Several capabilities mean "any of
 * these". No principal means no access (fail closed).
 */
export function checkCapability(
  principal: Principal | null,
  facilityId: string | null,
  capability: Capability | readonly Capability[],
  context: AuthzContext = {},
): boolean {
  if (principal === null) return false;
  const target = { facilityId: facilityId ?? undefined, ...context };
  const wanted = typeof capability === "string" ? [capability] : capability;
  return wanted.some((item) => can(principal, item, target));
}

/**
 * Capability check for the signed-in principal at the current facility. This only
 * decides what the UI shows: apps/api and Medplum enforce the same rules on every request.
 */
export function useCan() {
  const principal = useAuthStore((state) => state.principal);
  const facilityId = useAuthStore((state) => state.facilityId);
  return (capability: Capability | readonly Capability[], context?: AuthzContext) =>
    checkCapability(principal, facilityId, capability, context);
}
