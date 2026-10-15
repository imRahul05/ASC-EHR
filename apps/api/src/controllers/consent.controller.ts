import { formatZodError, signConsentSchema, type SignConsentInput } from "@asc/validation";
import type { FastifyReply, FastifyRequest } from "fastify";

import { getCaseContext } from "../hooks/case-context.js";
import { getConsent, signConsent } from "../services/consent-service.js";

/**
 * Controller for informed consent digital tablet capture and retrieval.
 */
export const consentController = {
  async signConsent(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);

    const parsed = signConsentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "invalid_payload",
        message: "Invalid consent payload",
        details: formatZodError(parsed.error),
      });
    }

    const body: SignConsentInput = parsed.data;

    const result = await signConsent({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: body,
      logger: request.log,
    });

    if (result.status === 404) {
      return reply.code(404).send({
        code: result.code,
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
