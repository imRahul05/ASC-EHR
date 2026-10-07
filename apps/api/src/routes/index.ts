import type { FastifyInstance } from "fastify";
import { healthRoute } from "./health.js";
import { meRoute } from "./me.js";

export function registerRoutes(app: FastifyInstance) {
  app.register(healthRoute);
  app.register(meRoute);
}
