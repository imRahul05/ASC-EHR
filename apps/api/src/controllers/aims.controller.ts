import { API_ERROR_CODES, type RuleReason } from "@asc/types";
import type {
  AimsBatchInput,
  AnesthesiaEntryInput,
  PreAnesthesiaAssessmentInput,
} from "@asc/validation";
import type { FastifyReply, FastifyRequest } from "fastify";
import "../auth/augment.js";
import "../plugins/error-handler.js";
import "../plugins/medplum.js";

import { getCaseContext } from "../hooks/case-context.js";
import {
  getCaseAnesthesiaRecord,
  recordAnesthesiaEntry,
  recordPreAnesthesiaAssessment,
  syncAimsBatch,
} from "../services/aims-service.js";

type AimsControllerResult<T> =
  | { readonly status: 200; readonly data: T }
  | { readonly status: 404; readonly code: "not_found"; readonly message: string }
  | {
      readonly status: 409;
      readonly code: "GATE_FAILED";
      readonly message: string;
      readonly reasons?: readonly RuleReason[];
    };

function handleAimsResult<T>(reply: FastifyReply, result: AimsControllerResult<T>): FastifyReply {
  if (result.status === 404) {
    return reply.sendApiError({
      code: API_ERROR_CODES.NOT_FOUND,
      message: result.message,
    });
  }

  if (result.status === 409) {
    return reply.sendApiError({
      code: API_ERROR_CODES.GATE_FAILED,
      status: 409,
      message: result.message,
      ...(result.reasons ? { reasons: result.reasons } : {}),
    });
  }

  return reply.code(200).send(result.data);
}

/**
 * Controller for AIMS Anesthesia Flowsheet and pre-evaluation endpoints.
 */
export const aimsController = {
  async getAnesthesiaRecord(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);
    const result = await getCaseAnesthesiaRecord({
      medplum: request.medplum,
      facilityId,
      caseId,
    });
    return handleAimsResult(reply, result);
  },

  async recordEntry(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);
    const body = request.body as AnesthesiaEntryInput;
    const actorId = request.principal?.id ?? "staff-actor";
    const actorName = request.principal?.id ? `Staff (${request.principal.id})` : "Staff User";

    const result = await recordAnesthesiaEntry({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: body,
      actor: {
        id: actorId,
        name: actorName,
        initials: actorName.slice(0, 2).toUpperCase(),
      },
      logger: request.log,
    });
    return handleAimsResult(reply, result);
  },

  async recordPreAssessment(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);
    const body = request.body as PreAnesthesiaAssessmentInput;
    const actorId = request.principal?.id ?? "staff-actor";
    const actorName = request.principal?.id ? `Staff (${request.principal.id})` : "Staff User";

    const result = await recordPreAnesthesiaAssessment({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: body,
      actor: {
        id: actorId,
        name: actorName,
        initials: actorName.slice(0, 2).toUpperCase(),
      },
      logger: request.log,
    });
    return handleAimsResult(reply, result);
  },

  async syncBatch(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);
    const body = request.body as AimsBatchInput;
    const actorId = request.principal?.id ?? "staff-actor";
    const actorName = request.principal?.id ? `Staff (${request.principal.id})` : "Staff User";

    const result = await syncAimsBatch({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: body,
      actor: {
        id: actorId,
        name: actorName,
        initials: actorName.slice(0, 2).toUpperCase(),
      },
      logger: request.log,
    });
    return handleAimsResult(reply, result);
  },
};
