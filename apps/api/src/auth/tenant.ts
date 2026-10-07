import type { TenantResolver } from "@asc/authz";
import type { FastifyInstance } from "fastify";

import "./augment.js";
import type { createDenier } from "./denied.js";

/**
 * Gate 1. The tenant comes from the `TenantResolver` only (the request host,
 * which a static resolver ignores in phase 1). A `tenantId` in the body, query
 * string or a header is never read. No tenant means 404, never a hint why.
 */
export function registerTenantGate(
  app: FastifyInstance,
  resolver: TenantResolver,
  deny: ReturnType<typeof createDenier>,
): void {
  app.addHook("onRequest", async (request, reply) => {
    const tenant = await resolver.resolve({ host: request.hostname });
    if (tenant === undefined) {
      return deny(request, reply, { status: 404, gate: 1, reason: "unknown-tenant" });
    }
    request.tenant = tenant;
    return undefined;
  });
}
