import { API_ERROR_CODES } from "@asc/types";
import type { FastifyReply, FastifyRequest } from "fastify";
import { resolveFacilityId } from "../routes/route-helpers.js";
import { getWhiteboard } from "../services/whiteboard-service.js";

export const whiteboardController = {
  async getWhiteboard(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = request.query as { mode?: string; facilityId?: string } | undefined;
    const facilityId = request.facilityId ?? resolveFacilityId(request, query?.facilityId);

    if (!facilityId) {
      return reply.sendApiError({
        code: API_ERROR_CODES.FACILITY_REQUIRED,
        message: "Facility context is required to view the whiteboard",
      });
    }

    if (!(await request.server.guards.requireCapabilityAt(request, reply, "schedule.read", facilityId))) {
      return reply;
    }

    const isTvMode = query?.mode === "tv";
    const board = await getWhiteboard({
      medplum: request.medplum,
      facilityId,
      isTvMode,
      logger: request.log,
    });

    return reply.code(200).send(board);
  },
};
