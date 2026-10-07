import type { FastifyInstance } from "fastify";
import { publicRoute } from "../auth/route-auth.js";
import type { HealthResponse } from "../schemas/health.js";
import { healthResponseJsonSchema } from "../schemas/health.js";

export function healthRoute(app: FastifyInstance): Promise<void> {
  app.get(
    "/health",
    {
      config: publicRoute(),
      schema: {
        response: {
          200: healthResponseJsonSchema,
        },
      },
    },
    (): HealthResponse => ({
      status: "ok",
      timestamp: new Date().toISOString(),
    }),
  );
  return Promise.resolve();
}
