import type { FastifyInstance } from "fastify";
import { casesRoutes } from "./cases.js";
import { healthRoute } from "./health.js";
import { meRoute } from "./me.js";
import { patientsRoutes } from "./patients.js";
import { whiteboardRoutes } from "./whiteboard.js";

export function registerRoutes(app: FastifyInstance) {
  app.register(healthRoute);
  app.register(meRoute);
  app.register(patientsRoutes);
  app.register(casesRoutes);
  app.register(whiteboardRoutes);
}
