import { applicableGrants } from "@asc/authz";
import { PERMITTED_HP_OVERRIDE_ROLES } from "@asc/clinical-rules/gates";
import { API_ERROR_CODES } from "@asc/types";
import type {
  AnticoagulationAssessmentInput,
  HpOverrideInput,
  HpUpdateNoteInput,
} from "@asc/validation";
import type { FastifyReply, FastifyRequest } from "fastify";

import { getCaseContext } from "../hooks/case-context.js";
import { submitAnticoagulationAssessment } from "../services/anticoagulation-service.js";
import { getHpDetail, submitHpOverride, submitHpUpdateNote } from "../services/hp-service.js";

/**
 * Controller for History & Physical (H&P) interval notes, clinical overrides, and anticoagulation assessments.
 */
export const hpController = {
  async recordHpUpdate(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);
    const body = request.body as HpUpdateNoteInput;

    const result = await submitHpUpdateNote({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: body,
      logger: request.log,
      practitionerId: request.principal?.id,
      practitionerName: body.practitionerName,
    });

    if (result.status === 404) {
      return reply.sendApiError({
        code: API_ERROR_CODES.NOT_FOUND,
        message: result.message,
      });
    }

    return reply.code(200).send(result);
  },

  async recordHpOverride(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);
    const body = request.body as HpOverrideInput;

    const roles = request.principal
      ? applicableGrants(request.principal, facilityId).flatMap((g) => g.roleKeys)
      : [];
    const hasPermittedRole = roles.some((role) =>
      PERMITTED_HP_OVERRIDE_ROLES.includes(role),
    );
    if (!hasPermittedRole) {
      return reply.sendApiError({
        code: API_ERROR_CODES.FORBIDDEN,
        status: 403,
        message: "H&P override requires attending physician or medical director role",
      });
    }

    const result = await submitHpOverride({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: body,
      logger: request.log,
      actorId: request.principal?.id,
    });

    if (result.status === 403) {
      return reply.sendApiError({
        code: API_ERROR_CODES.FORBIDDEN,
        status: 403,
        message: result.message,
      });
    }

    if (result.status === 404) {
      return reply.sendApiError({
        code: API_ERROR_CODES.NOT_FOUND,
        message: result.message,
      });
    }

    return reply.code(200).send(result);
  },

  async getHpDetail(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);

    const result = await getHpDetail({
      medplum: request.medplum,
      facilityId,
      caseId,
    });

    if (result.status === 404) {
      return reply.sendApiError({
        code: API_ERROR_CODES.NOT_FOUND,
        message: result.message,
      });
    }

    return reply.code(200).send(result.data);
  },

  async getHp(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    return hpController.getHpDetail(request, reply);
  },

  async recordAnticoagulation(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);
    const body = request.body as AnticoagulationAssessmentInput;

    const result = await submitAnticoagulationAssessment({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: body,
      logger: request.log,
      assessorId: request.principal?.id,
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
