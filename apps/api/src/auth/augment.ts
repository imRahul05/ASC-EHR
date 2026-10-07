import type { IdentityCacheState } from "@asc/authz";
import type { Capability, Principal, TenantRef } from "@asc/types";

import type { createGuards } from "./guards.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Gate 1: set from the TenantResolver, never from a body, query string or header. */
    tenant?: TenantRef;
    /** Gate 2: set from the IdentityPort after the token is validated for the tenant's project. */
    principal?: Principal;
    /** Gate 2: whether the identity came from the adapter's cache (audit decision provenance). */
    identityCache?: IdentityCacheState;
    /** Gates 3 and 4: set once a handler has run `requireCapabilityAt` for a resource route. */
    facilityChecked?: boolean;
  }

  interface FastifyInstance {
    /** Every registered route with its declared auth, in registration order (route inventory test). */
    routeAuthInventory(): { method: string; url: string; auth: NonNullable<FastifyContextConfig["auth"]> }[];
    /** Authorization checks for handlers whose facility is only known after loading a resource. */
    guards: ReturnType<typeof createGuards>;
  }

  interface FastifyContextConfig {
    /**
     * What a route requires. Declared per route (see `route-auth.ts`):
     * `public` (no token), `authenticated` (any signed-in caller) or `capability`
     * (gates 3 and 4). For a capability the target facility comes from a route
     * parameter, from the loaded resource (the handler must call
     * `app.guards.requireCapabilityAt`), or is absent (only all-site grants pass).
     */
    auth?:
      | { readonly mode: "public" }
      | { readonly mode: "authenticated" }
      | {
          readonly mode: "capability";
          readonly capability: Capability;
          readonly facility: { readonly from: "none" } | { readonly from: "param"; readonly name: string } | { readonly from: "resource" };
        };
  }
}
