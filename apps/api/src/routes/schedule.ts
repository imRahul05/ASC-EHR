import { API_ROUTE_PATTERNS } from "@asc/config";
import { getScheduleQuerySchema } from "@asc/validation";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";
import { scheduleController } from "../controllers/schedule.controller.js";
import { validateQuery } from "../hooks/validation.js";

export function scheduleRoutes(app: FastifyInstance): Promise<void> {
  // GET /schedule — Date-bounded day-slate appointments, rooms, and procedure cases
  app.get(
    API_ROUTE_PATTERNS.schedule,
    {
      config: capabilityAtResource("schedule.read"),
      preHandler: [validateQuery(getScheduleQuerySchema, "Invalid schedule query parameters")],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return scheduleController.getSchedule(request, reply);
    },
  );

  return Promise.resolve();
}
