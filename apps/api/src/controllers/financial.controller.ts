import {
  copayCollectionSchema,
  eligibilityCheckRequestSchema,
  formatZodError,
  priorAuthCheckSchema,
} from "@asc/validation";
import type { FastifyReply, FastifyRequest } from "fastify";

import { getCaseContext } from "../hooks/case-context.js";
import { financialClearanceService } from "../services/financial-clearance-service.js";

interface EligibilityCheckPayload {
  readonly forceRefresh?: boolean;
  readonly serviceTypeCode?: string;
}

interface CopayBodyPayload {
  readonly amountCents?: number;
  readonly paymentMethod?: string;
  readonly transactionRef?: string;
  readonly paymentPlanDetails?: {
    readonly monthlyCents?: number;
    readonly numberOfMonths?: number;
    readonly firstDueDate?: string;
  };
  readonly notes?: string;
}

interface PriorAuthPayload {
  readonly authNumber?: string;
  readonly status?: string;
  readonly validFrom?: string;
  readonly validTo?: string;
  readonly approvedCptCodes?: readonly string[];
  readonly approvedUnits?: number;
  readonly notes?: string;
}

/**
 * Controller for Real-Time Eligibility (270/271), Dual GFE, Copay Collection, and Prior Auth (278).
 */
export const financialController = {
  async checkEligibility(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);

    const body = (request.body as EligibilityCheckPayload | undefined) ?? {};
    const parsed = eligibilityCheckRequestSchema.safeParse({
      caseId,
      ...body,
    });

    if (!parsed.success) {
      return reply.code(400).send({
        code: "invalid_payload",
        message: "Invalid eligibility check payload",
        details: formatZodError(parsed.error),
      });
    }

    const result = await financialClearanceService.checkEligibility({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: parsed.data,
      logger: request.log,
    });

    if (result.status === 404) {
      return reply.code(404).send({
        code: result.code,
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
      return reply.code(404).send({
        code: result.code,
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

    const body = (request.body as CopayBodyPayload | undefined) ?? {};
    const parsed = copayCollectionSchema.safeParse({
      caseId,
      ...body,
      transactionRef: body.transactionRef ?? headerIdempotencyKey,
    });

    if (!parsed.success) {
      return reply.code(400).send({
        code: "invalid_payload",
        message: "Invalid copay collection payload",
        details: formatZodError(parsed.error),
      });
    }

    const result = await financialClearanceService.collectCopay({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: parsed.data,
      actorId: request.principal?.id,
      logger: request.log,
    });

    if (result.status === 404) {
      return reply.code(404).send({
        code: result.code,
        message: result.message,
      });
    }

    return reply.code(200).send(result.data);
  },

  async revalidatePriorAuth(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);

    const body = (request.body as PriorAuthPayload | undefined) ?? {};
    const parsed = priorAuthCheckSchema.safeParse(body);

    if (!parsed.success) {
      return reply.code(400).send({
        code: "invalid_payload",
        message: "Invalid prior authorization payload",
        details: formatZodError(parsed.error),
      });
    }

    const result = await financialClearanceService.recordPriorAuth({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: parsed.data,
      logger: request.log,
    });

    if (result.status === 404) {
      return reply.code(404).send({
        code: result.code,
        message: result.message,
      });
    }

    return reply.code(200).send(result.data);
  },
};
