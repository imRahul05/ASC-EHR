import cors from "@fastify/cors";
import Fastify from "fastify";
import { loggerOptions } from "@asc/logger";
import { resolveRequestId } from "./lib/request-id.js";
import { registerRateLimit, registerSecurityHeaders } from "./plugins/security.js";
import { registerRoutes } from "./routes/index.js";

interface AppOptions {
  /** Exact browser origins allowed cross-origin (from `resolveCorsOrigins`). Empty = none. */
  readonly corsOrigins: readonly string[];
  /** Pre-authentication flood guard: requests per window and address (`RATE_LIMIT_IP_MAX`). */
  readonly rateLimit: { readonly ipMax: number; readonly windowMs: number };
}

export async function buildApp({ corsOrigins, rateLimit }: AppOptions) {
  const app = Fastify({
    logger: loggerOptions,
    // Client-supplied IDs are accepted only if well-formed (see resolveRequestId).
    genReqId: (req) => resolveRequestId(req.headers),
  });

  await registerSecurityHeaders(app);

  // Auth is a Bearer header, not cookies, so credentials stay off.
  await app.register(cors, {
    origin: corsOrigins.length > 0 ? [...corsOrigins] : false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Accept", "Authorization", "Content-Type", "X-Correlation-Id", "X-Request-Id"],
    maxAge: 600,
  });

  await registerRateLimit(app, {
    max: rateLimit.ipMax,
    windowMs: rateLimit.windowMs,
    key: (request) => `ip:${request.ip}`,
  });

  app.addHook("onRequest", (request, _reply, done) => {
    request.log = request.log.child({ correlationId: request.id });
    done();
  });

  registerRoutes(app);

  return app;
}
