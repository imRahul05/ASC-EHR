import { API_ROUTE_PATTERNS } from "@asc/config";
import {
  aimsBatchSchema,
  anesthesiaEntrySchema,
  preAnesthesiaAssessmentSchema,
} from "@asc/validation";
import type { FastifyInstance } from "fastify";

import { aimsController } from "../controllers/aims.controller.js";
import {
  clinicalMutationRoute,
  clinicalQueryRoute,
} from "../hooks/pipeline.js";

/**
 * AIMS Anesthesia Flowsheet & Offline Replay Routes (Phase P20 / REQ-10, US-E-05, US-F-08, US-F-09)
 *
 * Implements:
 * - Hydrated AnesthesiaRecord retrieval
 * - Intra-op anesthesia flowsheet entries (vitals, drugs, airway events, sedation milestones)
 * - Pre-anesthesia medical assessment gate enforcement (CMS 42 CFR § 416.42(a))
 * - Offline batch synchronization with clientId deduplication
 */
export function aimsRoutes(app: FastifyInstance): Promise<void> {
  // GET /cases/:caseId/anesthesia — Hydrated flowsheet & record
  app.get(
    API_ROUTE_PATTERNS.caseAnesthesia,
    clinicalQueryRoute({ capability: "anesthesia.document" }),
    (request, reply) => aimsController.getAnesthesiaRecord(request, reply),
  );

  // POST /cases/:caseId/anesthesia — Intra-op anesthesia entry (vitals, drug, airway, sedation)
  app.post(
    API_ROUTE_PATTERNS.caseAnesthesia,
    clinicalMutationRoute({
      capability: "anesthesia.document",
      schema: anesthesiaEntrySchema,
      errorMessage: "Invalid anesthesia entry payload.",
    }),
    (request, reply) => aimsController.recordEntry(request, reply),
  );

  // POST /cases/:caseId/anesthesia/pre-assessment — CMS 42 CFR § 416.42(a) pre-anesthesia evaluation
  app.post(
    API_ROUTE_PATTERNS.casePreAnesthesia,
    clinicalMutationRoute({
      capability: "anesthesia.document",
      schema: preAnesthesiaAssessmentSchema,
      errorMessage: "Invalid pre-anesthesia assessment payload.",
    }),
    (request, reply) => aimsController.recordPreAssessment(request, reply),
  );

  // POST /cases/:caseId/aims/batch — Offline queue batch synchronization
  app.post(
    API_ROUTE_PATTERNS.caseAimsBatch,
    clinicalMutationRoute({
      capability: "anesthesia.document",
      schema: aimsBatchSchema,
      errorMessage: "Invalid AIMS batch payload.",
    }),
    (request, reply) => aimsController.syncBatch(request, reply),
  );

  return Promise.resolve();
}
