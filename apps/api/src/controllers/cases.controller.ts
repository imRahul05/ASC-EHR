import { API_ERROR_CODES, type ApiErrorCode } from "@asc/types";
import type {
  BookCaseInput,
  TransitionCaseInput,
} from "@asc/validation";
import type { FastifyReply, FastifyRequest } from "fastify";
import "../auth/augment.js";
import "../plugins/error-handler.js";
import "../plugins/medplum.js";

import { getCaseContext } from "../hooks/case-context.js";
import { bookCase, createInMemorySchedulingLock } from "../services/case-booking-service.js";
import { getCaseDetail, transitionCase } from "../services/case-read-service.js";

const defaultFallbackLock = createInMemorySchedulingLock();

/**
 * Controller for surgical case management endpoints.
 */
export const casesController = {
  async bookCase(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = request.body as BookCaseInput;
    const facilityId = body.facilityId.trim();

    if (!(await request.server.guards.requireCapabilityAt(request, reply, "schedule.manage", facilityId))) {
      return reply;
    }

    const tenantId = request.tenant?.tenantId;
    if (!tenantId) {
      return reply.sendApiError({
        code: API_ERROR_CODES.FORBIDDEN,
        status: 403,
        message: "Tenant context is required",
      });
    }

    const rawHeaderKey = request.headers["x-idempotency-key"] ?? request.headers["idempotency-key"];
    const headerIdempotencyKey =
      typeof rawHeaderKey === "string" && rawHeaderKey.trim().length > 0
        ? rawHeaderKey.trim()
        : undefined;

    const schedulingLock = request.server.facilitySchedulingLock ?? defaultFallbackLock;

    const result = await bookCase({
      medplum: request.medplum,
      schedulingLock,
      tenantId,
      facilityId,
      body,
      headerIdempotencyKey,
      logger: request.log,
    });

    if (!("data" in result)) {
      const code = (result.code as ApiErrorCode) ?? API_ERROR_CODES.INTERNAL_ERROR;
      return reply.sendApiError({
        code,
        status: result.status,
        message: result.message,
        ...(result.details ? { details: result.details } : {}),
        ...(result.reasons ? { reasons: result.reasons } : {}),
      });
    }

    return reply.code(result.status).send(result.data);
  },

  async getCase(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);

    const detail = await getCaseDetail({
      medplum: request.medplum,
      facilityId,
      caseId,
    });

    if (!detail) {
      return reply.sendApiError({
        code: API_ERROR_CODES.NOT_FOUND,
        message: `Case ${caseId} not found`,
      });
    }

    return reply.code(200).send(detail);
  },

  async transitionCase(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);
    const body = request.body as TransitionCaseInput;

    const result = await transitionCase({
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

    if (result.status === 409) {
      return reply.sendApiError({
        code: result.code ?? API_ERROR_CODES.GATE_FAILED,
        status: 409,
        message: result.message,
        reasons: result.reasons,
      });
    }

    return reply.code(200).send(result.data);
  },
};
