import cors from "@fastify/cors";
import Fastify from "fastify";
import type { AuditClient } from "@asc/audit";
import type { IdentityPort, TenantResolver } from "@asc/authz";
import { loggerOptions } from "@asc/logger";
import { registerAuthentication } from "./auth/authn.js";
import { createDenier } from "./auth/denied.js";
import { registerDefaultDeny } from "./auth/default-deny.js";
import { createGuards, registerAuthorization } from "./auth/guards.js";
import { registerTenantGate } from "./auth/tenant.js";
import { resolveRequestId } from "./lib/request-id.js";
import { registerRateLimit, registerSecurityHeaders } from "./plugins/security.js";
import { registerRoutes } from "./routes/index.js";

interface AppOptions {
  /** Exact browser origins allowed cross-origin (from `resolveCorsOrigins`). Empty = none. */
  readonly corsOrigins: readonly string[];
  /**
   * Requests per window: `ipMax` per tenant and address in front of authentication
   * (`RATE_LIMIT_IP_MAX`), `userMax` per tenant and signed-in user (`RATE_LIMIT_USER_MAX`).
   */
  readonly rateLimit: { readonly ipMax: number; readonly userMax: number; readonly windowMs: number };
  /** Gate 1. `StaticTenantResolver` in phase 1. */
  readonly tenantResolver: TenantResolver;
  /** Gate 2. The Medplum adapter from P05i; a dev-only fake before that. */
  readonly identity: IdentityPort;
  /** Where denials are recorded (`getAuditClient()` in the server; a durable store in production). */
  readonly audit: Pick<AuditClient, "logEvent">;
  /** Build id (`GIT_SHA`) stamped on audit decisions. */
  readonly catalogVersion: string;
}

export async function buildApp({ corsOrigins, rateLimit, tenantResolver, identity, audit, catalogVersion }: AppOptions) {
  const app = Fastify({
    logger: loggerOptions,
    // Client-supplied IDs are accepted only if well-formed (see resolveRequestId).
    genReqId: (req) => resolveRequestId(req.headers),
  });
  registerDefaultDeny(app); // before any route or plugin that registers routes
  const deny = createDenier({ audit, catalogVersion });

  await registerSecurityHeaders(app);

  // Auth is a Bearer header, not cookies, so credentials stay off.
  await app.register(cors, {
    origin: corsOrigins.length > 0 ? [...corsOrigins] : false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Accept", "Authorization", "Content-Type", "X-Correlation-Id", "X-Request-Id"],
    maxAge: 600,
  });

  app.addHook("onRequest", (request, _reply, done) => {
    request.log = request.log.child({ correlationId: request.id });
    done();
  });

  // Hook order on every request: tenant (gate 1) -> flood limit (tenant and address) -> identity (gate 2) -> facility and capability (gates 3 and 4).
  registerTenantGate(app, tenantResolver, deny);
  await registerRateLimit(app, {
    max: rateLimit.ipMax,
    windowMs: rateLimit.windowMs,
    key: (request) => `${request.tenant?.tenantId ?? "no-tenant"}:ip:${request.ip}`,
  });
  registerAuthentication(app, {
    identity,
    deny,
    userRateLimit: { max: rateLimit.userMax, windowMs: rateLimit.windowMs },
  });
  registerAuthorization(app, createGuards(deny));

  registerRoutes(app);

  return app;
}
