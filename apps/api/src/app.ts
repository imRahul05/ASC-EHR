import Fastify from "fastify";
import { registerRoutes } from "./routes/index.js";
import { loggerOptions } from "@repo/logger";
import crypto from "crypto";

export function buildApp() {
  const app = Fastify({
    logger: loggerOptions,
    genReqId: (req) => {
      // Use provided correlation ID or generate a new one
      const reqId = req.headers['x-correlation-id'] || req.headers['x-request-id'] || crypto.randomUUID();
      return reqId as string;
    }
  });

  // Example hook to add correlationId to log context
  app.addHook('onRequest', (request, reply, done) => {
    request.log = request.log.child({ correlationId: request.id });
    done();
  });

  registerRoutes(app);

  return app;
}
