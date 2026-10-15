import { API_ROUTE_PATTERNS } from "@asc/config";
import { formatZodError, signConsentSchema, type SignConsentInput } from "@asc/validation";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";
import { getConsent, signConsent } from "../services/consent-service.js";
import { FHIR_ID, resolveFacilityId } from "./route-helpers.js";

interface CaseRouteParams {
  readonly caseId: string;
}

interface CaseQuery {
  readonly facilityId?: string;
}

/**
 * Informed Consent Routes (Phase P17 / EP-E, EP-F)
 *
 * Implements:
 * - Digital tablet informed consent capture with touch/pointer signature verification
 * - Procedure CPT and intent matching (detecting procedure mismatch)
 * - Consent resource retrieval
 */
export function consentRoutes(app: FastifyInstance): Promise<void> {
  // POST /cases/:caseId/consent — Digital tablet informed consent capture
  app.post<{ Params: CaseRouteParams; Querystring: CaseQuery }>(
    API_ROUTE_PATTERNS.caseConsent,
    { config: capabilityAtResource("consent.collect") },
    async (request: FastifyRequest<{ Params: CaseRouteParams; Querystring: CaseQuery }>, reply: FastifyReply) => {
      const { caseId } = request.params;
      const parsed = signConsentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          code: "invalid_payload",
          message: "Invalid consent payload",
          details: formatZodError(parsed.error),
        });
      }

      const body: SignConsentInput = parsed.data;
      const facilityId = resolveFacilityId(request, body.facilityId);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to sign consent",
        });
      }

      if (!FHIR_ID.test(caseId)) {
        return reply.code(400).send({
          code: "invalid_case_id",
          message: "Invalid case ID format",
        });
      }

      if (!(await app.guards.requireCapabilityAt(request, reply, "consent.collect", facilityId))) {
        return reply;
      }

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
    }
  );

  // GET /cases/:caseId/consent — Retrieve informed consent for case
  app.get<{ Params: CaseRouteParams; Querystring: CaseQuery }>(
    API_ROUTE_PATTERNS.caseConsent,
    { config: capabilityAtResource("case.read") },
    async (request: FastifyRequest<{ Params: CaseRouteParams; Querystring: CaseQuery }>, reply: FastifyReply) => {
      const { caseId } = request.params;
      const facilityId = resolveFacilityId(request);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to retrieve consent",
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

      const consent = await getConsent({
        medplum: request.medplum,
        facilityId,
        caseId,
      });

      return reply.code(200).send(consent);
    }
  );

  return Promise.resolve();
}
