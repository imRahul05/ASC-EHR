import { applicableGrants } from "@asc/authz";
import { PERMITTED_HP_OVERRIDE_ROLES } from "@asc/clinical-rules/gates";
import {
  anticoagulationAssessmentSchema,
  formatZodError,
  hpOverrideSchema,
  hpUpdateNoteSchema,
  type AnticoagulationAssessmentInput,
  type HpOverrideInput,
  type HpUpdateNoteInput,
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

    const parsed = hpUpdateNoteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "invalid_payload",
        message: "Invalid H&P update note payload",
        details: formatZodError(parsed.error),
      });
    }

    const body: HpUpdateNoteInput = parsed.data;

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
      return reply.code(404).send({
        code: result.code,
        message: result.message,
      });
    }

    return reply.code(200).send(result);
  },

  async recordHpOverride(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);

    const parsed = hpOverrideSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "invalid_payload",
        message: "Invalid H&P override payload",
        details: formatZodError(parsed.error),
      });
    }

    const body: HpOverrideInput = parsed.data;

    // Enforce role restriction: only attending physician or medical director can override H&P
    const grants = request.principal ? applicableGrants(request.principal, facilityId) : [];
    const userRoles = grants.flatMap((g) => g.roleKeys);
    const isAuthorizedPhysician = userRoles.some((r) => PERMITTED_HP_OVERRIDE_ROLES.includes(r));

    if (!isAuthorizedPhysician) {
      return reply.code(403).send({
        code: "forbidden",
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
      actorName: body.practitionerName,
      actorRole: userRoles.find((r) => PERMITTED_HP_OVERRIDE_ROLES.includes(r)),
    });

    if (result.status === 403) {
      return reply.code(403).send({
        code: result.code,
        message: result.message,
      });
    }

    if (result.status === 404) {
      return reply.code(404).send({
        code: result.code,
        message: result.message,
      });
    }

    return reply.code(200).send(result);
  },

  async recordAnticoagulation(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);

    const parsed = anticoagulationAssessmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "invalid_payload",
        message: "Invalid anticoagulation assessment payload",
        details: formatZodError(parsed.error),
      });
    }

    const body: AnticoagulationAssessmentInput = parsed.data;

    const result = await submitAnticoagulationAssessment({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: body,
      logger: request.log,
      assessorId: request.principal?.id,
      assessorName: body.assessorName,
    });

    if (result.status === 404) {
      return reply.code(404).send({
        code: result.code,
        message: result.message,
      });
    }

    return reply.code(200).send(result);
  },

  async getHp(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { caseId, facilityId } = getCaseContext(request);

    const result = await getHpDetail({
      medplum: request.medplum,
      facilityId,
      caseId,
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
