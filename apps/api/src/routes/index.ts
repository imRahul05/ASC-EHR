import type { FastifyInstance } from "fastify";
import { healthRoute } from "./health.js";

export function registerRoutes(app: FastifyInstance) {
  app.register(healthRoute);
}
