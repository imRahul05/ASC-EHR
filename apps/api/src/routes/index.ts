import type { FastifyInstance } from "fastify";
import { healthRoute } from "./health.js";
import { meRoute } from "./me.js";
import { patientsRoutes } from "./patients.js";

export function registerRoutes(app: FastifyInstance) {
  app.register(healthRoute);
  app.register(meRoute);
  app.register(patientsRoutes);
}
