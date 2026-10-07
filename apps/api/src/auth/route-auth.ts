import { CAPABILITY_CATALOG } from "@asc/types";
import type { Capability } from "@asc/types";

import "./augment.js";

/**
 * Route options that declare what a route requires. Every route must spread one of
 * these into its options (`{ config: publicRoute() }`); a route without one is
 * refused at startup (default deny).
 */
export function publicRoute() {
  return { auth: { mode: "public" as const } };
}

/** Any signed-in caller of this tenant, no capability (for example `GET /me`). */
export function authenticatedRoute() {
  return { auth: { mode: "authenticated" as const } };
}

/** Gate 3 and 4: a grant at the target facility must include `capability`. */
export function capabilityRoute(capability: Capability, options: { facilityParam?: string } = {}) {
  return { auth: { mode: "capability" as const, capability, ...options } };
}

/** High-risk capabilities re-validate with the identity provider on every call (no cache). */
export function isStepUp(capability: Capability): boolean {
  return CAPABILITY_CATALOG.some((entry) => entry.key === capability && entry.stepUp);
}
