import type { IdentityCacheState } from "@asc/authz";
import type { Capability, Principal, TenantRef } from "@asc/types";

declare module "fastify" {
  interface FastifyRequest {
    /** Gate 1: set from the TenantResolver, never from a body, query string or header. */
    tenant?: TenantRef;
    /** Gate 2: set from the IdentityPort after the token is validated for the tenant's project. */
    principal?: Principal;
    /** Gate 2: whether the identity came from the adapter's cache (audit decision provenance). */
    identityCache?: IdentityCacheState;
  }

  interface FastifyInstance {
    /** Every registered route with its declared auth, in registration order (route inventory test). */
    routeAuthInventory(): { method: string; url: string; auth: NonNullable<FastifyContextConfig["auth"]> }[];
  }

  interface FastifyContextConfig {
    /**
     * What a route requires. Declared per route (see `route-auth.ts`):
     * `public` (no token), `authenticated` (any signed-in caller) or `capability`
     * (gates 3 and 4). `facilityParam` names the route parameter that holds the
     * target facility id.
     */
    auth?:
      | { readonly mode: "public" }
      | { readonly mode: "authenticated" }
      | { readonly mode: "capability"; readonly capability: Capability; readonly facilityParam?: string };
  }
}
