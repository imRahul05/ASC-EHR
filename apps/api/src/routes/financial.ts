import { API_ROUTE_PATTERNS } from "@asc/config";
import type { FastifyInstance } from "fastify";

import { financialController } from "../controllers/financial.controller.js";
import {
  clinicalMutationRoute,
  clinicalQueryRoute,
} from "../hooks/pipeline.js";

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
    clinicalMutationRoute({
      capability: "patient.eligibility.check",
    }),
    (request, reply) => financialController.checkEligibility(request, reply)
  );

  // GET /cases/:caseId/financial-summary — Full financial clearance summary and dual GFE
  app.get(
    API_ROUTE_PATTERNS.caseFinancialSummary,
    clinicalQueryRoute({ capability: "case.read" }),
    (request, reply) => financialController.getFinancialSummary(request, reply)
  );

  // POST /cases/:caseId/copay-collected — Front-desk copay/deductible collection and payment plan
  app.post(
    API_ROUTE_PATTERNS.caseCopayCollected,
    clinicalMutationRoute({
      capability: "patient.register",
    }),
    (request, reply) => financialController.recordCopay(request, reply)
  );

  // POST /cases/:caseId/prior-auth — Record and revalidate X12 278 prior authorization
  app.post(
    API_ROUTE_PATTERNS.casePriorAuth,
    clinicalMutationRoute({
      capability: "patient.eligibility.check",
    }),
    (request, reply) => financialController.revalidatePriorAuth(request, reply)
  );

  return Promise.resolve();
}
