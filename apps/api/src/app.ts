import cors from "@fastify/cors";
import Fastify from "fastify";
import type { AuditClient } from "@asc/audit";
import type { TenantResolver } from "@asc/authz";
import { loggerOptions } from "@asc/logger";
import { createDenier } from "./auth/denied.js";
import { registerTenantGate } from "./auth/tenant.js";
import { resolveRequestId } from "./lib/request-id.js";
import { registerRateLimit, registerSecurityHeaders } from "./plugins/security.js";
import { registerRoutes } from "./routes/index.js";

interface AppOptions {
  /** Exact browser origins allowed cross-origin (from `resolveCorsOrigins`). Empty = none. */
  readonly corsOrigins: readonly string[];
  /** Pre-authentication flood guard: requests per window, per tenant and address (`RATE_LIMIT_IP_MAX`). */
  readonly rateLimit: { readonly ipMax: number; readonly windowMs: number };
  /** Gate 1. `StaticTenantResolver` in phase 1. */
  readonly tenantResolver: TenantResolver;
  /** Where denials are recorded (`getAuditClient()` in the server; a durable store in production). */
  readonly audit: Pick<AuditClient, "logEvent">;
  /** Build id (`GIT_SHA`) stamped on audit decisions. */
  readonly catalogVersion: string;
}

export async function buildApp({ corsOrigins, rateLimit, tenantResolver, audit, catalogVersion }: AppOptions) {
  const app = Fastify({
    logger: loggerOptions,
    // Client-supplied IDs are accepted only if well-formed (see resolveRequestId).
    genReqId: (req) => resolveRequestId(req.headers),
  });
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

  // Hook order on every request: tenant (gate 1) -> flood limit (keyed by tenant and address).
  registerTenantGate(app, tenantResolver, deny);
  await registerRateLimit(app, {
    max: rateLimit.ipMax,
    windowMs: rateLimit.windowMs,
    key: (request) => `${request.tenant?.tenantId ?? "no-tenant"}:ip:${request.ip}`,
  });

  registerRoutes(app);

  return app;
}
