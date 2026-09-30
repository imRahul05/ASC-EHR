import cors from "@fastify/cors";
import Fastify from "fastify";
import { loggerOptions } from "@asc/logger";
import { resolveRequestId } from "./lib/request-id.js";
import { registerRoutes } from "./routes/index.js";

interface AppOptions {
  /** Exact browser origins allowed cross-origin (from `resolveCorsOrigins`). Empty = none. */
  readonly corsOrigins: readonly string[];
}

export function buildApp({ corsOrigins }: AppOptions) {
  const app = Fastify({
    logger: loggerOptions,
    // Client-supplied IDs are accepted only if well-formed (see resolveRequestId).
    genReqId: (req) => resolveRequestId(req.headers),
  });

  // Auth is a Bearer header, not cookies, so credentials stay off.
  void app.register(cors, {
    origin: corsOrigins.length > 0 ? [...corsOrigins] : false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Accept", "Authorization", "Content-Type", "X-Correlation-Id", "X-Request-Id"],
    maxAge: 600,
  });

  app.addHook("onRequest", (request, _reply, done) => {
    request.log = request.log.child({ correlationId: request.id });
    done();
  });

  registerRoutes(app);

  return app;
}
