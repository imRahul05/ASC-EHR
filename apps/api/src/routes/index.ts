import type { FastifyInstance } from "fastify";
import { casesRoutes } from "./cases.js";
import { consentRoutes } from "./consent.js";
import { financialRoutes } from "./financial.js";
import { healthRoute } from "./health.js";
import { hpRoutes } from "./hp.js";
import { meRoute } from "./me.js";
import { patientsRoutes } from "./patients.js";
import { preopRoutes } from "./preop.js";
import { scheduleRoutes } from "./schedule.js";
import { whiteboardRoutes } from "./whiteboard.js";

/**
 * Central Route Registration
 *
 * Registers domain route plugins into the Fastify server.
 * Domains are strictly segregated by clinical/administrative boundary:
 * - System: health, me
 * - Intake: patients
 * - Operating Room & Schedule: schedule, whiteboard
 * - Clinical Cases Core: cases (booking, detail, transition)
 * - Clinical Pre-Op & Safety: consent, preop, hp (H&P, anticoagulation)
 * - Financial & Billing: financial (270/271 eligibility, 278 prior-auth, GFE, copay)
 */
export function registerRoutes(app: FastifyInstance) {
  app.register(healthRoute);
  app.register(meRoute);
  app.register(patientsRoutes);
  app.register(casesRoutes);
  app.register(consentRoutes);
  app.register(preopRoutes);
  app.register(hpRoutes);
  app.register(financialRoutes);
  app.register(scheduleRoutes);
  app.register(whiteboardRoutes);
}
