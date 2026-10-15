import { API_ROUTE_PATTERNS } from "@asc/config";
import { formatZodError, preopAssessmentSchema, type PreopAssessmentInput } from "@asc/validation";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";
import { submitPreopAssessment } from "../services/preop-service.js";
import { FHIR_ID, resolveFacilityId } from "./route-helpers.js";

interface CaseRouteParams {
  readonly caseId: string;
}

interface CaseQuery {
  readonly facilityId?: string;
}

/**
 * Pre-Op Nursing Routes (Phase P17 / EP-E, EP-F)
 *
 * Implements:
 * - Pre-op bedside nursing intake assessment (vitals, IV gauge/site/attempts, NPO verification, escort check)
 * - LOINC discrete vitals observations persistence
 * - Gate 1 readiness updates
 */
export function preopRoutes(app: FastifyInstance): Promise<void> {
  // POST /cases/:caseId/preop-assessment — Pre-op bay nursing assessment
  app.post<{ Params: CaseRouteParams; Querystring: CaseQuery }>(
    API_ROUTE_PATTERNS.casePreopAssessment,
    { config: capabilityAtResource("procedure.document") },
    async (request: FastifyRequest<{ Params: CaseRouteParams; Querystring: CaseQuery }>, reply: FastifyReply) => {
      const { caseId } = request.params;
      const parsed = preopAssessmentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          code: "invalid_payload",
          message: "Invalid pre-op assessment payload",
          details: formatZodError(parsed.error),
        });
      }

      const body: PreopAssessmentInput = parsed.data;
      const facilityId = resolveFacilityId(request, body.facilityId);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to submit pre-op assessment",
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

      const result = await submitPreopAssessment({
        medplum: request.medplum,
        facilityId,
        caseId,
        input: body,
        logger: request.log,
        performerId: request.principal?.id,
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

  return Promise.resolve();
}
