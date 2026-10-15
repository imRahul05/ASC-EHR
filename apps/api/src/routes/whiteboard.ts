import { API_ROUTE_PATTERNS } from "@asc/config";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";
import { whiteboardController } from "../controllers/whiteboard.controller.js";

export { computeRoomStatuses } from "../services/whiteboard-service.js";

export function whiteboardRoutes(app: FastifyInstance): Promise<void> {
  // GET /whiteboard — Today's case whiteboard with server-side TV minimization
  app.get(
    API_ROUTE_PATTERNS.whiteboard,
    { config: capabilityAtResource("schedule.read") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return whiteboardController.getWhiteboard(request, reply);
    },
  );

  return Promise.resolve();
}
