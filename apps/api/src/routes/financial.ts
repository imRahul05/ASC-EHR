import { API_ROUTE_PATTERNS } from "@asc/config";
import {
  copayCollectionSchema,
  eligibilityCheckRequestSchema,
  formatZodError,
  priorAuthCheckSchema,
} from "@asc/validation";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";
import { financialClearanceService } from "../services/financial-clearance-service.js";
import { FHIR_ID, resolveFacilityId } from "./route-helpers.js";

interface CaseRouteParams {
  readonly caseId: string;
}

interface CaseQuery {
  readonly facilityId?: string;
}

interface EligibilityCheckPayload {
  readonly forceRefresh?: boolean;
  readonly serviceTypeCode?: string;
}

interface CopayBodyPayload {
  readonly amountCents?: number;
  readonly paymentMethod?: string;
  readonly transactionRef?: string;
  readonly paymentPlanDetails?: {
    readonly monthlyCents?: number;
    readonly numberOfMonths?: number;
    readonly firstDueDate?: string;
  };
  readonly notes?: string;
}

interface PriorAuthPayload {
  readonly authNumber?: string;
  readonly status?: string;
  readonly validFrom?: string;
  readonly validTo?: string;
  readonly approvedCptCodes?: readonly string[];
  readonly approvedUnits?: number;
  readonly notes?: string;
}

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
  app.post<{ Params: CaseRouteParams; Querystring: CaseQuery; Body: EligibilityCheckPayload }>(
    API_ROUTE_PATTERNS.caseEligibilityCheck,
    { config: capabilityAtResource("patient.eligibility.check") },
    async (
      request: FastifyRequest<{ Params: CaseRouteParams; Querystring: CaseQuery; Body: EligibilityCheckPayload }>,
      reply: FastifyReply
    ) => {
      const { caseId } = request.params;
      const facilityId = resolveFacilityId(request);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to check eligibility",
        });
      }

      if (!FHIR_ID.test(caseId)) {
        return reply.code(400).send({
          code: "invalid_case_id",
          message: "Invalid case ID format",
        });
      }

      if (!(await app.guards.requireCapabilityAt(request, reply, "patient.eligibility.check", facilityId))) {
        return reply;
      }

      const body = request.body ?? {};
      const parsed = eligibilityCheckRequestSchema.safeParse({
        caseId,
        ...body,
      });

      if (!parsed.success) {
        return reply.code(400).send({
          code: "invalid_payload",
          message: "Invalid eligibility check payload",
          details: formatZodError(parsed.error),
        });
      }

      const result = await financialClearanceService.checkEligibility({
        medplum: request.medplum,
        facilityId,
        caseId,
        input: parsed.data,
        logger: request.log,
      });

      if (result.status === 404) {
        return reply.code(404).send({
          code: result.code,
          message: result.message,
        });
      }

      return reply.code(200).send(result.data);
    }
  );

  // GET /cases/:caseId/financial-summary — Full financial clearance summary and dual GFE
  app.get<{ Params: CaseRouteParams; Querystring: CaseQuery }>(
    API_ROUTE_PATTERNS.caseFinancialSummary,
    { config: capabilityAtResource("case.read") },
    async (request: FastifyRequest<{ Params: CaseRouteParams; Querystring: CaseQuery }>, reply: FastifyReply) => {
      const { caseId } = request.params;
      const facilityId = resolveFacilityId(request);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to retrieve financial summary",
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

      const result = await financialClearanceService.getFinancialSummary({
        medplum: request.medplum,
        facilityId,
        caseId,
        logger: request.log,
      });

      if (result.status === 404) {
        return reply.code(404).send({
          code: result.code,
          message: result.message,
        });
      }

      return reply.code(200).send(result.data);
    }
  );

  // POST /cases/:caseId/copay-collected — Front-desk copay/deductible collection and payment plan
  app.post<{ Params: CaseRouteParams; Querystring: CaseQuery; Body: CopayBodyPayload }>(
    API_ROUTE_PATTERNS.caseCopayCollected,
    { config: capabilityAtResource("patient.register") },
    async (
      request: FastifyRequest<{ Params: CaseRouteParams; Querystring: CaseQuery; Body: CopayBodyPayload }>,
      reply: FastifyReply
    ) => {
      const { caseId } = request.params;
      const facilityId = resolveFacilityId(request);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to record copay collection",
        });
      }

      if (!FHIR_ID.test(caseId)) {
        return reply.code(400).send({
          code: "invalid_case_id",
          message: "Invalid case ID format",
        });
      }

      if (!(await app.guards.requireCapabilityAt(request, reply, "patient.register", facilityId))) {
        return reply;
      }

      const body = request.body ?? {};
      const parsed = copayCollectionSchema.safeParse({
        caseId,
        ...body,
      });

      if (!parsed.success) {
        return reply.code(400).send({
          code: "invalid_payload",
          message: "Invalid copay collection payload",
          details: formatZodError(parsed.error),
        });
      }

      const result = await financialClearanceService.collectCopay({
        medplum: request.medplum,
        facilityId,
        caseId,
        input: parsed.data,
        actorId: request.principal?.id,
        logger: request.log,
      });

      if (result.status === 404) {
        return reply.code(404).send({
          code: result.code,
          message: result.message,
        });
      }

      return reply.code(200).send(result.data);
    }
  );

  // POST /cases/:caseId/prior-auth — Record and revalidate X12 278 prior authorization
  app.post<{ Params: CaseRouteParams; Querystring: CaseQuery; Body: PriorAuthPayload }>(
    API_ROUTE_PATTERNS.casePriorAuth,
    { config: capabilityAtResource("patient.eligibility.check") },
    async (
      request: FastifyRequest<{ Params: CaseRouteParams; Querystring: CaseQuery; Body: PriorAuthPayload }>,
      reply: FastifyReply
    ) => {
      const { caseId } = request.params;
      const facilityId = resolveFacilityId(request);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to record prior authorization",
        });
      }

      if (!FHIR_ID.test(caseId)) {
        return reply.code(400).send({
          code: "invalid_case_id",
          message: "Invalid case ID format",
        });
      }

      if (!(await app.guards.requireCapabilityAt(request, reply, "patient.eligibility.check", facilityId))) {
        return reply;
      }

      const body = request.body ?? {};
      const parsed = priorAuthCheckSchema.safeParse(body);

      if (!parsed.success) {
        return reply.code(400).send({
          code: "invalid_payload",
          message: "Invalid prior authorization payload",
          details: formatZodError(parsed.error),
        });
      }

      const result = await financialClearanceService.recordPriorAuth({
        medplum: request.medplum,
        facilityId,
        caseId,
        input: parsed.data,
        logger: request.log,
      });

      if (result.status === 404) {
        return reply.code(404).send({
          code: result.code,
          message: result.message,
        });
      }

      return reply.code(200).send(result.data);
    }
  );

  return Promise.resolve();
}
