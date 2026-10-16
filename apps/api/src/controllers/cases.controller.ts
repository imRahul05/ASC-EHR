import { applicableGrants } from "@asc/authz";
import { API_ERROR_CODES, type ApiErrorCode } from "@asc/types";
import type {
  AssignScopeInput,
  BookCaseInput,
  Gate2OverrideInput,
  RecordProcedureEventInput,
  SignTimeOutInput,
  TransitionCaseInput,
} from "@asc/validation";
import type { FastifyReply, FastifyRequest } from "fastify";
import "../auth/augment.js";
import "../plugins/error-handler.js";
import "../plugins/medplum.js";

import { getCaseContext } from "../hooks/case-context.js";
import { bookCase, createInMemorySchedulingLock } from "../services/case-booking-service.js";
import { getCaseDetail, transitionCase } from "../services/case-read-service.js";
import {
  assignCaseScope,
  overrideCaseGate2,
  recordCaseProcedureEvent,
  recordCaseTimeOut,
} from "../services/procedure-capture-service.js";

const defaultFallbackLock = createInMemorySchedulingLock();

interface CaptureOperationResult<T> {
  readonly status: 200 | 403 | 404 | 409;
  readonly data?: T;
  readonly code?: string;
  readonly message?: string;
  readonly reasons?: readonly { readonly code: string; readonly message: string }[];
}

function handleCaptureResult<T>(reply: FastifyReply, result: CaptureOperationResult<T>): FastifyReply {
  if (result.status === 404) {
    return reply.sendApiError({ code: API_ERROR_CODES.NOT_FOUND, message: result.message ?? "Not found" });
  }
  if (result.status === 403) {
    return reply.sendApiError({ code: API_ERROR_CODES.FORBIDDEN, status: 403, message: result.message ?? "Forbidden" });
  }
  if (result.status === 409) {
    return reply.sendApiError({
      code: API_ERROR_CODES.GATE_FAILED,
      status: 409,
      message: result.message ?? "Gate failed",
      ...(result.reasons ? { reasons: result.reasons } : {}),
    });
  }
  return reply.code(200).send(result.data);
}

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

  async recordTimeOut(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);
    const body = request.body as SignTimeOutInput;
    const actorId = request.principal?.id ?? "staff-actor";
    const primaryRole = request.principal
      ? applicableGrants(request.principal, facilityId).flatMap((g) => g.roleKeys)[0]
      : undefined;

    const result = await recordCaseTimeOut({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: body,
      actor: { id: actorId, name: "Staff User", ...(primaryRole ? { role: primaryRole } : {}) },
      logger: request.log,
    });
    return handleCaptureResult(reply, result);
  },

  async recordProcedureEvent(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);
    const body = request.body as RecordProcedureEventInput;
    const actorId = request.principal?.id ?? "staff-actor";

    const result = await recordCaseProcedureEvent({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: body,
      actor: { id: actorId, name: "Staff User" },
      logger: request.log,
    });
    return handleCaptureResult(reply, result);
  },

  async assignScope(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);
    const body = request.body as AssignScopeInput;
    const actorId = request.principal?.id ?? "staff-actor";

    const result = await assignCaseScope({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: body,
      actor: { id: actorId, name: "Staff User" },
      logger: request.log,
    });
    return handleCaptureResult(reply, result);
  },

  async overrideGate2(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);
    const body = request.body as Gate2OverrideInput;
    const actorId = request.principal?.id ?? "staff-actor";
    const primaryRole = request.principal
      ? applicableGrants(request.principal, facilityId).flatMap((g) => g.roleKeys)[0]
      : undefined;

    const result = await overrideCaseGate2({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: body,
      actor: { id: actorId, name: body.actorName || "Staff Physician", ...(primaryRole ? { role: primaryRole } : {}) },
      logger: request.log,
    });
    return handleCaptureResult(reply, result);
  },
};
