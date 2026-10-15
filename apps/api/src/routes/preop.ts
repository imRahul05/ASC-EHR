import { API_ROUTE_PATTERNS } from "@asc/config";
import { preopAssessmentSchema } from "@asc/validation";
import type { FastifyInstance } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";
import { preopController } from "../controllers/preop.controller.js";
import { requireCapabilityHook, requireCaseContext, validateBody } from "../hooks/case-context.js";

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
  app.post(
    API_ROUTE_PATTERNS.casePreopAssessment,
    {
      config: capabilityAtResource("procedure.document"),
      preHandler: [
        requireCapabilityHook("procedure.document"),
        requireCaseContext,
        validateBody(preopAssessmentSchema, "Invalid pre-op assessment payload."),
      ],
    },
    (request, reply) => preopController.recordPreopAssessment(request, reply)
  );

  return Promise.resolve();
}
