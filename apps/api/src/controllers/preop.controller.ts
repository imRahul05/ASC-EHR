import { API_ERROR_CODES } from "@asc/types";
import type { PreopAssessmentInput } from "@asc/validation";
import type { FastifyReply, FastifyRequest } from "fastify";
import "../auth/augment.js";
import "../plugins/error-handler.js";
import "../plugins/medplum.js";

import { getCaseContext } from "../hooks/case-context.js";
import { submitPreopAssessment } from "../services/preop-service.js";

/**
 * Controller for bedside pre-op nursing intake assessments.
 */
export const preopController = {
  async recordPreopAssessment(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);
    const body = request.body as PreopAssessmentInput;

    const result = await submitPreopAssessment({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: body,
      logger: request.log,
      performerId: request.principal?.id,
    });

    if (result.status === 404) {
      return reply.sendApiError({
        code: API_ERROR_CODES.NOT_FOUND,
        message: result.message,
      });
    }

    return reply.code(200).send(result);
  },
};
