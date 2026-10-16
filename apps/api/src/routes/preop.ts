import { API_ROUTE_PATTERNS } from "@asc/config";
import { preopAssessmentSchema } from "@asc/validation";
import type { FastifyInstance } from "fastify";

import { preopController } from "../controllers/preop.controller.js";
import { clinicalMutationRoute } from "../hooks/pipeline.js";

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
    clinicalMutationRoute({
      capability: "procedure.document",
      schema: preopAssessmentSchema,
      errorMessage: "Invalid pre-op assessment payload.",
    }),
    (request, reply) => preopController.recordPreopAssessment(request, reply)
  );

  return Promise.resolve();
}
