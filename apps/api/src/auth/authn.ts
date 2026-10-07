import type { IdentityFailure, IdentityPort } from "@asc/authz";
import type { FastifyInstance } from "fastify";

import "./augment.js";
import { tooManyRequests } from "../plugins/security.js";
import type { createDenier } from "./denied.js";
import { isStepUp } from "./route-auth.js";

// `Authorization: Bearer <token>`, scheme case-insensitive, one opaque token, bounded length.
const BEARER = /^Bearer ([^\s]{1,4096})$/i;

/** How each identity failure is answered. Exhaustive over `IdentityFailure`. */
const FAILURES = {
  "invalid-token": { status: 401, reason: "invalid-token" },
  "wrong-project": { status: 401, reason: "wrong-project" },
  "inactive-membership": { status: 401, reason: "inactive-membership" },
  // The provider is down: never allow, never fall back to a stale answer. Not a decision, so not audited.
  unavailable: { status: 503 },
} as const satisfies Record<IdentityFailure, { status: 401 | 503; reason?: string }>;

/**
 * Gate 2. Validates the bearer token through the `IdentityPort` for the tenant
 * gate 1 resolved, and binds `request.principal`. Public routes skip it. A
 * capability marked `stepUp` makes the adapter bypass its cache and re-validate.
 * The token is never logged, audited or echoed.
 */
export function registerAuthentication(
  app: FastifyInstance,
  options: {
    identity: IdentityPort;
    deny: ReturnType<typeof createDenier>;
    /** Per-tenant-and-user flood limit, checked once the caller is known. */
    userRateLimit: { max: number; windowMs: number };
  },
): void {
  const { identity, deny } = options;
  const checkUserLimit = app.createRateLimit({
    max: options.userRateLimit.max,
    timeWindow: options.userRateLimit.windowMs,
    keyGenerator: (request) => `${request.tenant?.tenantId ?? "no-tenant"}:user:${request.principal?.id ?? "no-user"}`,
  });

  app.addHook("onRequest", async (request, reply) => {
    const auth = request.routeOptions.config.auth;
    if (auth?.mode === "public") return undefined;

    const tenant = request.tenant;
    if (tenant === undefined) return deny(request, reply, { status: 404, gate: 1, reason: "unknown-tenant" });

    const token = BEARER.exec(request.headers.authorization ?? "")?.[1];
    if (token === undefined) return deny(request, reply, { status: 401, gate: 2, reason: "invalid-token" });

    const stepUp = auth?.mode === "capability" && isStepUp(auth.capability);
    const result = await identity.authenticate(token, tenant, { stepUp });
    if (!result.ok) {
      const failure = FAILURES[result.reason];
      return "reason" in failure
        ? deny(request, reply, { status: failure.status, gate: 2, reason: failure.reason })
        : deny(request, reply, { status: failure.status });
    }
    // An adapter must only ever return principals of the tenant it was asked about.
    if (result.principal.tenant.tenantId !== tenant.tenantId) {
      return deny(request, reply, { status: 401, gate: 2, reason: "wrong-project" });
    }

    request.principal = result.principal;
    request.identityCache = result.cache;

    const limit = await checkUserLimit(request);
    // `isAllowed: true` means the key is allow-listed (not counted); otherwise check the budget.
    if (!limit.isAllowed && limit.isExceeded) return tooManyRequests(reply, limit.ttlInSeconds);
    return undefined;
  });
}
