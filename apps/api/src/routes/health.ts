import type { FastifyInstance } from "fastify";
import { healthResponseSchema } from "../schemas/health.js";

export async function healthRoute(app: FastifyInstance) {
  app.get(
    "/health",
    {
      schema: {
        response: {
          200: healthResponseSchema,
        },
      },
    },
    async (_request, _reply) => {
      return {
        status: "ok" as const,
        timestamp: new Date().toISOString(),
      };
    }
  );
}
