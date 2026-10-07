import type { IdentityCacheState } from "@asc/authz";
import type { Principal, TenantRef } from "@asc/types";

declare module "fastify" {
  interface FastifyRequest {
    /** Gate 1: set from the TenantResolver, never from a body, query string or header. */
    tenant?: TenantRef;
    /** Gate 2: set from the IdentityPort after the token is validated for the tenant's project. */
    principal?: Principal;
    /** Gate 2: whether the identity came from the adapter's cache (audit decision provenance). */
    identityCache?: IdentityCacheState;
  }
}
