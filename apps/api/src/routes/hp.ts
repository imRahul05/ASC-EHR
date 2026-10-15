import { applicableGrants } from "@asc/authz";
import { PERMITTED_HP_OVERRIDE_ROLES } from "@asc/clinical-rules/gates";
import { API_ROUTE_PATTERNS } from "@asc/config";
import {
  anticoagulationAssessmentSchema,
  formatZodError,
  hpOverrideSchema,
  hpUpdateNoteSchema,
  type AnticoagulationAssessmentInput,
  type HpOverrideInput,
  type HpUpdateNoteInput,
} from "@asc/validation";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";
import { submitAnticoagulationAssessment } from "../services/anticoagulation-service.js";
import { getHpDetail, submitHpOverride, submitHpUpdateNote } from "../services/hp-service.js";
import { FHIR_ID, resolveFacilityId } from "./route-helpers.js";

interface CaseRouteParams {
  readonly caseId: string;
}

interface CaseQuery {
  readonly facilityId?: string;
}

/**
 * History & Physical (H&P) & Anticoagulation Routes (Phase P16 / EP-E, EP-F)
 *
 * Implements:
 * - CMS 42 CFR § 416.52 30-day H&P validity engine with mandatory day-of interval update note
 * - Attending physician / Medical Director H&P expiration clinical override
 * - ASGE 2022 peri-procedural anticoagulation & antiplatelet bleeding risk evaluation
 * - H&P detail and document retrieval
 */
export function hpRoutes(app: FastifyInstance): Promise<void> {
  // POST /cases/:caseId/hp-update — Sign day-of H&P interval update note
  app.post<{ Params: CaseRouteParams; Querystring: CaseQuery }>(
    API_ROUTE_PATTERNS.caseHpUpdate,
    { config: capabilityAtResource("procedure.document") },
    async (request: FastifyRequest<{ Params: CaseRouteParams; Querystring: CaseQuery }>, reply: FastifyReply) => {
      const { caseId } = request.params;
      const parsed = hpUpdateNoteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          code: "invalid_payload",
          message: "Invalid H&P update note payload",
          details: formatZodError(parsed.error),
        });
      }

      const body: HpUpdateNoteInput = parsed.data;
      const facilityId = resolveFacilityId(request, body.facilityId);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to submit H&P update note",
        });
      }

      if (!FHIR_ID.test(caseId)) {
        return reply.code(400).send({
          code: "invalid_case_id",
          message: "Invalid case ID format",
        });
      }

      if (!(await app.guards.requireCapabilityAt(request, reply, "procedure.document", facilityId))) {
        return reply;
      }

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
    }
  );

  // POST /cases/:caseId/hp-override — Attending physician clinical override of H&P validity
  app.post<{ Params: CaseRouteParams; Querystring: CaseQuery }>(
    API_ROUTE_PATTERNS.caseHpOverride,
    { config: capabilityAtResource("case.advance") },
    async (request: FastifyRequest<{ Params: CaseRouteParams; Querystring: CaseQuery }>, reply: FastifyReply) => {
      const { caseId } = request.params;
      const parsed = hpOverrideSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          code: "invalid_payload",
          message: "Invalid H&P override payload",
          details: formatZodError(parsed.error),
        });
      }

      const body: HpOverrideInput = parsed.data;
      const facilityId = resolveFacilityId(request, body.facilityId);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to override H&P",
        });
      }

      if (!FHIR_ID.test(caseId)) {
        return reply.code(400).send({
          code: "invalid_case_id",
          message: "Invalid case ID format",
        });
      }

      if (!(await app.guards.requireCapabilityAt(request, reply, "case.advance", facilityId))) {
        return reply;
      }

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
    }
  );

  // POST /cases/:caseId/anticoagulation — Peri-procedural anticoagulation & antiplatelet assessment
  app.post<{ Params: CaseRouteParams; Querystring: CaseQuery }>(
    API_ROUTE_PATTERNS.caseAnticoagulation,
    { config: capabilityAtResource("procedure.document") },
    async (request: FastifyRequest<{ Params: CaseRouteParams; Querystring: CaseQuery }>, reply: FastifyReply) => {
      const { caseId } = request.params;
      const parsed = anticoagulationAssessmentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          code: "invalid_payload",
          message: "Invalid anticoagulation assessment payload",
          details: formatZodError(parsed.error),
        });
      }

      const body: AnticoagulationAssessmentInput = parsed.data;
      const facilityId = resolveFacilityId(request, body.facilityId);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to submit anticoagulation assessment",
        });
      }

      if (!FHIR_ID.test(caseId)) {
        return reply.code(400).send({
          code: "invalid_case_id",
          message: "Invalid case ID format",
        });
      }

      if (!(await app.guards.requireCapabilityAt(request, reply, "procedure.document", facilityId))) {
        return reply;
      }

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
    }
  );

  // GET /cases/:caseId/hp — Retrieve pre-procedure H&P status and day-of update note details
  app.get<{ Params: CaseRouteParams; Querystring: CaseQuery }>(
    API_ROUTE_PATTERNS.caseHp,
    { config: capabilityAtResource("case.read") },
    async (request: FastifyRequest<{ Params: CaseRouteParams; Querystring: CaseQuery }>, reply: FastifyReply) => {
      const { caseId } = request.params;
      const facilityId = resolveFacilityId(request);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to retrieve H&P details",
        });
      }

      if (!FHIR_ID.test(caseId)) {
        return reply.code(400).send({
          code: "invalid_case_id",
          message: "Invalid case ID format",
        });
      }

      if (!(await app.guards.requireCapabilityAt(request, reply, "case.read", facilityId))) {
        return reply;
      }

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
    }
  );

  return Promise.resolve();
}
