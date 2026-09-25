import type { FastifyInstance } from "fastify";
import type { HealthResponse } from "../schemas/health.js";
import { healthResponseJsonSchema } from "../schemas/health.js";

export function healthRoute(app: FastifyInstance): Promise<void> {
  app.get(
    "/health",
    {
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
