import { API_ERROR_CODES } from "@asc/types";
import type { GetScheduleQuery } from "@asc/validation";
import type { FastifyReply, FastifyRequest } from "fastify";
import "../auth/augment.js";
import "../hooks/facility-context.js";
import "../plugins/error-handler.js";
import "../plugins/medplum.js";
import { resolveFacilityId } from "../routes/route-helpers.js";
import { getScheduleDay } from "../services/schedule-service.js";

export const scheduleController = {
  async getSchedule(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = request.query as GetScheduleQuery | undefined;
    const facilityId = request.facilityId ?? resolveFacilityId(request, query?.facilityId);

    if (!facilityId) {
      return reply.sendApiError({
        code: API_ERROR_CODES.FACILITY_REQUIRED,
        message: "Facility context is required to view the schedule",
      });
    }

    if (!(await request.server.guards.requireCapabilityAt(request, reply, "schedule.read", facilityId))) {
      return reply;
    }

    const scheduleDay = await getScheduleDay({
      medplum: request.medplum,
      facilityId,
      date: query?.date,
      logger: request.log,
    });

    return reply.code(200).send(scheduleDay);
  },
};
