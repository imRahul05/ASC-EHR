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

/**
 * Gates 3 and 4. A grant at the target facility must include `capability`.
 * - `facilityParam`: the route parameter that holds the target facility id.
 * - without it: no facility is named, so only an all-site grant passes (fail closed).
 * For a facility that is only known after loading a resource use `capabilityAtResource`.
 */
export function capabilityRoute(capability: Capability, options: { facilityParam?: string } = {}) {
  const facility =
    options.facilityParam === undefined
      ? ({ from: "none" } as const)
      : ({ from: "param", name: options.facilityParam } as const);
  return { auth: { mode: "capability" as const, capability, facility } };
}

/**
 * The target facility is a property of a resource the handler loads (a case, a
 * patient). The handler MUST call `app.guards.requireCapabilityAt(request, reply,
 * capability, resource.facilityId)`; a successful response without that call is
 * replaced by a 500, so a forgotten check fails closed. A caller who holds the
 * capability nowhere is refused before the handler runs.
 */
export function capabilityAtResource(capability: Capability) {
  return { auth: { mode: "capability" as const, capability, facility: { from: "resource" } as const } };
}

/** High-risk capabilities re-validate with the identity provider on every call (no cache). */
export function isStepUp(capability: Capability): boolean {
  return CAPABILITY_CATALOG.some((entry) => entry.key === capability && entry.stepUp);
}
