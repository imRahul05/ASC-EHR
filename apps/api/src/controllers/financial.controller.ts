import { API_ERROR_CODES } from "@asc/types";
import type {
  CopayCollection,
  EligibilityCheckRequest,
  PriorAuthCheck,
} from "@asc/validation";
import type { FastifyReply, FastifyRequest } from "fastify";
import "../auth/augment.js";
import "../plugins/error-handler.js";
import "../plugins/medplum.js";

import { getCaseContext } from "../hooks/case-context.js";
import { financialClearanceService } from "../services/financial-clearance-service.js";

type EligibilityBody = Omit<EligibilityCheckRequest, "caseId">;
type CopayBody = Omit<CopayCollection, "caseId">;

/**
 * Controller for Real-Time Eligibility (270/271), Dual GFE, Copay Collection, and Prior Auth (278).
 */
export const financialController = {
  async checkEligibility(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);

    const body = (request.body as EligibilityBody | undefined) ?? {};
    const result = await financialClearanceService.checkEligibility({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: {
        ...body,
        caseId,
      },
      logger: request.log,
    });

    if (result.status === 404) {
      return reply.sendApiError({
        code: API_ERROR_CODES.NOT_FOUND,
        message: result.message,
      });
    }

    return reply.code(200).send(result.data);
  },

  async getFinancialSummary(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);

    const result = await financialClearanceService.getFinancialSummary({
      medplum: request.medplum,
      facilityId,
      caseId,
      logger: request.log,
    });

    if (result.status === 404) {
      return reply.sendApiError({
        code: API_ERROR_CODES.NOT_FOUND,
        message: result.message,
      });
    }

    return reply.code(200).send(result.data);
  },

  async recordCopay(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);

    const rawHeaderKey = request.headers["x-idempotency-key"] ?? request.headers["idempotency-key"];
    const headerIdempotencyKey =
      typeof rawHeaderKey === "string" && rawHeaderKey.trim().length > 0
        ? rawHeaderKey.trim()
        : undefined;

    const body = (request.body as CopayBody | undefined) ?? ({} as CopayBody);
    const result = await financialClearanceService.collectCopay({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: {
        ...body,
        caseId,
        transactionRef: body.transactionRef ?? headerIdempotencyKey,
      },
      actorId: request.principal?.id,
      logger: request.log,
    });

    if (result.status === 404) {
      return reply.sendApiError({
        code: API_ERROR_CODES.NOT_FOUND,
        message: result.message,
      });
    }

    return reply.code(200).send(result.data);
  },

  async revalidatePriorAuth(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);
    const body = (request.body as PriorAuthCheck | undefined) ?? ({} as PriorAuthCheck);

    const result = await financialClearanceService.recordPriorAuth({
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

    return reply.code(200).send(result.data);
  },
};
