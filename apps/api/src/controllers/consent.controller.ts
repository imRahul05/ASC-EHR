import { API_ERROR_CODES } from "@asc/types";
import type { SignConsentInput } from "@asc/validation";
import type { FastifyReply, FastifyRequest } from "fastify";
import "../auth/augment.js";
import "../plugins/error-handler.js";
import "../plugins/medplum.js";

import { getCaseContext } from "../hooks/case-context.js";
import { getConsent, signConsent } from "../services/consent-service.js";

/**
 * Controller for informed consent digital tablet capture and retrieval.
 */
export const consentController = {
  async signConsent(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);
    const body = request.body as SignConsentInput;

    const result = await signConsent({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: body,
      logger: request.log,
    });

    if (result.status === 404) {
      return reply.sendApiError({
        code: API_ERROR_CODES.NOT_FOUND,
        message: result.message,
      });
    }

    return reply.code(200).send(result);
  },

  async getConsent(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);

    const consent = await getConsent({
      medplum: request.medplum,
      facilityId,
      caseId,
    });

    return reply.code(200).send(consent);
  },
};
