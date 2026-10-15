import { API_ROUTE_PATTERNS } from "@asc/config";
import { signConsentSchema } from "@asc/validation";
import type { FastifyInstance } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";
import { consentController } from "../controllers/consent.controller.js";
import { requireCapabilityHook, requireCaseContext, validateBody } from "../hooks/case-context.js";

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
  app.post(
    API_ROUTE_PATTERNS.caseConsent,
    {
      config: capabilityAtResource("consent.collect"),
      preHandler: [
        requireCapabilityHook("consent.collect"),
        requireCaseContext,
        validateBody(signConsentSchema, "Invalid consent payload."),
      ],
    },
    (request, reply) => consentController.signConsent(request, reply)
  );

  // GET /cases/:caseId/consent — Retrieve informed consent for case
  app.get(
    API_ROUTE_PATTERNS.caseConsent,
    {
      config: capabilityAtResource("case.read"),
      preHandler: [requireCapabilityHook("case.read"), requireCaseContext],
    },
    (request, reply) => consentController.getConsent(request, reply)
  );

  return Promise.resolve();
}
