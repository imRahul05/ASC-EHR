import { API_ROUTE_PATTERNS } from "@asc/config";
import type { FacilitySchedulingLock } from "@asc/types";
import {
  assignScopeInputSchema,
  bookCaseSchema,
  gate2OverrideInputSchema,
  recordProcedureEventInputSchema,
  signTimeOutInputSchema,
  transitionCaseSchema,
} from "@asc/validation";
import type { FastifyInstance } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";
import { casesController } from "../controllers/cases.controller.js";
import {
  clinicalMutationRoute,
  clinicalQueryRoute,
} from "../hooks/pipeline.js";
import { validateBody } from "../hooks/validation.js";

// export
export { classifyMedplumReadError } from "../services/medplum-error-classifier.js";
export { createInMemorySchedulingLock } from "../services/case-booking-service.js";

declare module "fastify" {
  interface FastifyInstance {
    facilitySchedulingLock?: FacilitySchedulingLock;
  }
}

/**
 * Core Case Management Routes (Phase P15a/P15b/P15c / EP-C)
 *
 * Implements:
 * - Surgical case booking with facility-level advisory concurrency locks
 * - Fully hydrated Case Workspace detail retrieval
 * - Hard-gated clinical lifecycle transitions (Gate 1 and Gate 2 validation)
 * - Multi-role surgical timeout, intra-op room capture, scope lock & Gate 2 override (Phase P18)
 */
export function casesRoutes(app: FastifyInstance): Promise<void> {
  // POST /cases — Book a surgical case into an operating room (Phase P15a/P15b)
  // Note: Creates a new case entity without an existing caseId parameter; therefore uses
  // validateBody directly rather than clinicalMutationRoute (which hydrates existing case context).
  app.post(
    API_ROUTE_PATTERNS.cases,
    {
      config: capabilityAtResource("schedule.manage"),
      preHandler: [validateBody(bookCaseSchema)],
    },
    (request, reply) => casesController.bookCase(request, reply)
  );

  // GET /cases/:caseId — Fully hydrated Case Workspace detail bundle
  app.get(
    API_ROUTE_PATTERNS.case,
    clinicalQueryRoute({ capability: "case.read" }),
    (request, reply) => casesController.getCase(request, reply)
  );

  // POST /cases/:caseId/transition — Validates and executes physical stage transitions
  app.post(
    API_ROUTE_PATTERNS.caseTransition,
    clinicalMutationRoute({
      capability: "case.advance",
      schema: transitionCaseSchema,
      errorMessage: "Invalid case transition payload",
    }),
    (request, reply) => casesController.transitionCase(request, reply)
  );

  // POST /cases/:caseId/time-out — Multi-role surgical timeout verification (CMS 42 CFR § 416.52, UP.01.03.01)
  app.post(
    API_ROUTE_PATTERNS.caseTimeOut,
    clinicalMutationRoute({
      capability: "timeout.participate",
      schema: signTimeOutInputSchema,
      errorMessage: "Invalid surgical time-out verification payload",
    }),
    (request, reply) => casesController.recordTimeOut(request, reply)
  );

  // POST /cases/:caseId/events — Intra-op procedure milestone event capture
  app.post(
    API_ROUTE_PATTERNS.caseEvents,
    clinicalMutationRoute({
      capability: "procedure.document",
      schema: recordProcedureEventInputSchema,
      errorMessage: "Invalid intra-op procedure event payload",
    }),
    (request, reply) => casesController.recordProcedureEvent(request, reply)
  );

  // POST /cases/:caseId/scope — Endoscope assignment and 168-hour hang-time verification (AAMI ST91:2021)
  app.post(
    API_ROUTE_PATTERNS.caseScope,
    clinicalMutationRoute({
      capability: "procedure.document",
      schema: assignScopeInputSchema,
      errorMessage: "Invalid endoscope assignment payload",
    }),
    (request, reply) => casesController.assignScope(request, reply)
  );

  // POST /cases/:caseId/gate2-override — Clinical Gate 2 override for non-scope blockers
  app.post(
    API_ROUTE_PATTERNS.caseGate2Override,
    clinicalMutationRoute({
      capability: "case.advance",
      schema: gate2OverrideInputSchema,
      errorMessage: "Invalid Gate 2 override payload",
    }),
    (request, reply) => casesController.overrideGate2(request, reply)
  );

  return Promise.resolve();
}
