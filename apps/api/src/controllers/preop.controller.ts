import { formatZodError, preopAssessmentSchema, type PreopAssessmentInput } from "@asc/validation";
import type { FastifyReply, FastifyRequest } from "fastify";

import { getCaseContext } from "../hooks/case-context.js";
import { submitPreopAssessment } from "../services/preop-service.js";

/**
 * Controller for bedside pre-op nursing intake assessments.
 */
export const preopController = {
  async recordPreopAssessment(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);

    const parsed = preopAssessmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "invalid_payload",
        message: "Invalid pre-op assessment payload",
        details: formatZodError(parsed.error),
      });
    }

    const body: PreopAssessmentInput = parsed.data;

    const result = await submitPreopAssessment({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: body,
      logger: request.log,
      performerId: request.principal?.id,
    });

    if (result.status === 404) {
      return reply.code(404).send({
        code: result.code,
        message: result.message,
      });
    }

    return reply.code(200).send(result);
  },
};
