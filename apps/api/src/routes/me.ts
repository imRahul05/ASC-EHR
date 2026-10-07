import { grantedFacilityIds } from "@asc/authz";
import { API_ROUTE_PATTERNS } from "@asc/config";
import { meResponseSchema } from "@asc/validation";
import type { FastifyInstance } from "fastify";

import { authenticatedRoute } from "../auth/route-auth.js";

/**
 * `GET /me`: who the caller is, as the authorization layer sees them: the
 * principal (per-facility grants) and the facilities those grants name.
 * Any signed-in caller of the tenant may read their own principal.
 *
 * Facility names are the ids for now; the display names come from the Medplum
 * `Organization` with the identity adapter (P05i).
 */
export function meRoute(app: FastifyInstance): Promise<void> {
  app.get(API_ROUTE_PATTERNS.me, { config: authenticatedRoute() }, (request) => {
    const principal = request.principal;
    // The authentication hook always binds a principal before an authenticated route runs.
    if (principal === undefined) throw new Error("authenticated route reached without a principal");
    // Parsing our own output keeps the response inside the shared contract.
    return meResponseSchema.parse({
      principal,
      facilities: grantedFacilityIds(principal).map((id) => ({ id, name: id })),
    });
  });
  return Promise.resolve();
}
