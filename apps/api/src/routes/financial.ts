import { API_ROUTE_PATTERNS } from "@asc/config";
import type { FastifyInstance } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";
import { financialController } from "../controllers/financial.controller.js";
import { requireCapabilityHook, requireCaseContext } from "../hooks/case-context.js";

/**
 * Financial Clearance & Eligibility Routes (Phase P22a / EP-D)
 *
 * Implements:
 * - Real-time electronic healthcare eligibility benefit inquiry (HIPAA ANSI ASC X12 270/271)
 * - Financial clearance summary and dual Good-Faith Estimates (No Surprises Act 45 CFR § 149 / ACA 42 U.S.C. § 300gg-13)
 * - Front-desk copay/deductible collection and installment agreements
 * - Prior authorization validity and reschedule recheck (HIPAA ANSI ASC X12 278)
 */
export function financialRoutes(app: FastifyInstance): Promise<void> {
  // POST /cases/:caseId/eligibility/check — Real-time X12 270/271 eligibility verification
  app.post(
    API_ROUTE_PATTERNS.caseEligibilityCheck,
    {
      config: capabilityAtResource("patient.eligibility.check"),
      preHandler: [requireCapabilityHook("patient.eligibility.check"), requireCaseContext],
    },
    (request, reply) => financialController.checkEligibility(request, reply)
  );

  // GET /cases/:caseId/financial-summary — Full financial clearance summary and dual GFE
  app.get(
    API_ROUTE_PATTERNS.caseFinancialSummary,
    {
      config: capabilityAtResource("case.read"),
      preHandler: [requireCapabilityHook("case.read"), requireCaseContext],
    },
    (request, reply) => financialController.getFinancialSummary(request, reply)
  );

  // POST /cases/:caseId/copay-collected — Front-desk copay/deductible collection and payment plan
  app.post(
    API_ROUTE_PATTERNS.caseCopayCollected,
    {
      config: capabilityAtResource("patient.register"),
      preHandler: [requireCapabilityHook("patient.register"), requireCaseContext],
    },
    (request, reply) => financialController.recordCopay(request, reply)
  );

  // POST /cases/:caseId/prior-auth — Record and revalidate X12 278 prior authorization
  app.post(
    API_ROUTE_PATTERNS.casePriorAuth,
    {
      config: capabilityAtResource("patient.eligibility.check"),
      preHandler: [requireCapabilityHook("patient.eligibility.check"), requireCaseContext],
    },
    (request, reply) => financialController.revalidatePriorAuth(request, reply)
  );

  return Promise.resolve();
}
