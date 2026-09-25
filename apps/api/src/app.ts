import Fastify from "fastify";
import { loggerOptions } from "@asc/logger";
import { resolveRequestId } from "./lib/request-id.js";
import { registerRoutes } from "./routes/index.js";

export function buildApp() {
  const app = Fastify({
    logger: loggerOptions,
    // Client-supplied IDs are accepted only if well-formed (see resolveRequestId).
    genReqId: (req) => resolveRequestId(req.headers),
  });

  app.addHook("onRequest", (request, _reply, done) => {
    request.log = request.log.child({ correlationId: request.id });
    done();
  });

  registerRoutes(app);

  return app;
}
