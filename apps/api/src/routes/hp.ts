import { API_ROUTE_PATTERNS } from "@asc/config";
import {
  anticoagulationAssessmentSchema,
  hpOverrideSchema,
  hpUpdateNoteSchema,
} from "@asc/validation";
import type { FastifyInstance } from "fastify";

import { hpController } from "../controllers/hp.controller.js";
import {
  clinicalMutationRoute,
  clinicalQueryRoute,
} from "../hooks/pipeline.js";

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
  app.post(
    API_ROUTE_PATTERNS.caseHpUpdate,
    clinicalMutationRoute({
      capability: "procedure.document",
      schema: hpUpdateNoteSchema,
    }),
    (request, reply) => hpController.recordHpUpdate(request, reply)
  );

  // POST /cases/:caseId/hp-override — Attending physician clinical override of H&P validity
  app.post(
    API_ROUTE_PATTERNS.caseHpOverride,
    clinicalMutationRoute({
      capability: "case.advance",
      schema: hpOverrideSchema,
    }),
    (request, reply) => hpController.recordHpOverride(request, reply)
  );

  // POST /cases/:caseId/anticoagulation — Peri-procedural anticoagulation & antiplatelet assessment
  app.post(
    API_ROUTE_PATTERNS.caseAnticoagulation,
    clinicalMutationRoute({
      capability: "procedure.document",
      schema: anticoagulationAssessmentSchema,
    }),
    (request, reply) => hpController.recordAnticoagulation(request, reply)
  );

  // GET /cases/:caseId/hp — Retrieve pre-procedure H&P status and day-of update note details
  app.get(
    API_ROUTE_PATTERNS.caseHp,
    clinicalQueryRoute({ capability: "case.read" }),
    (request, reply) => hpController.getHp(request, reply)
  );

  return Promise.resolve();
}
