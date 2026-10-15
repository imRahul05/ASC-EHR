import { applicableGrants, grantedFacilityIds } from "@asc/authz";
import { PERMITTED_HP_OVERRIDE_ROLES } from "@asc/clinical-rules";
import { API_ROUTE_PATTERNS } from "@asc/config";
import type { FacilitySchedulingLock } from "@asc/types";
import {
  anticoagulationAssessmentSchema,
  bookCaseSchema,
  formatZodError,
  hpOverrideSchema,
  hpUpdateNoteSchema,
  preopAssessmentSchema,
  signConsentSchema,
  transitionCaseSchema,
  type AnticoagulationAssessmentInput,
  type BookCaseInput,
  type HpOverrideInput,
  type HpUpdateNoteInput,
  type PreopAssessmentInput,
  type SignConsentInput,
} from "@asc/validation";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";
import { submitAnticoagulationAssessment } from "../services/anticoagulation-service.js";
import { bookCase, createInMemorySchedulingLock } from "../services/case-booking-service.js";
import { getCaseDetail, transitionCase } from "../services/case-read-service.js";
import { getConsent, signConsent } from "../services/consent-service.js";
import { getHpDetail, submitHpOverride, submitHpUpdateNote } from "../services/hp-service.js";
import { submitPreopAssessment } from "../services/preop-service.js";

export { classifyMedplumReadError } from "../services/medplum-error-classifier.js";
export { createInMemorySchedulingLock } from "../services/case-booking-service.js";

declare module "fastify" {
  interface FastifyInstance {
    facilitySchedulingLock?: FacilitySchedulingLock;
  }
}

interface CaseRouteParams {
  readonly caseId: string;
}

interface CaseQuery {
  readonly facilityId?: string;
}

const FHIR_ID = /^[A-Za-z0-9._-]{1,64}$/;

function resolveFacilityId(
  request: FastifyRequest<{ Querystring: CaseQuery }>,
  preferredFacilityId?: string,
): string | undefined {
  if (preferredFacilityId !== undefined && preferredFacilityId.trim() !== "") {
    const trimmed = preferredFacilityId.trim();
    return FHIR_ID.test(trimmed) ? trimmed : undefined;
  }
  const queryVal = request.query?.facilityId;
  if (typeof queryVal === "string" && queryVal.trim() !== "") {
    const trimmed = queryVal.trim();
    return FHIR_ID.test(trimmed) ? trimmed : undefined;
  }
  const headerValue = request.headers["x-facility-id"];
  if (typeof headerValue === "string" && headerValue.trim() !== "") {
    const trimmed = headerValue.trim();
    return FHIR_ID.test(trimmed) ? trimmed : undefined;
  }
  if (request.principal !== undefined) {
    const granted = grantedFacilityIds(request.principal);
    const first = granted[0];
    if (first !== undefined && FHIR_ID.test(first)) return first;
  }
  return undefined;
}

const defaultFallbackLock = createInMemorySchedulingLock();

export function casesRoutes(app: FastifyInstance): Promise<void> {
  const schedulingLock = app.facilitySchedulingLock ?? defaultFallbackLock;

  // POST /cases — Book a surgical case into an operating room (Phase P15a/P15b)
  app.post(
    API_ROUTE_PATTERNS.cases,
    { config: capabilityAtResource("schedule.manage") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = bookCaseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          code: "invalid_payload",
          message: "Invalid case booking payload",
          details: formatZodError(parsed.error),
        });
      }

      const body: BookCaseInput = parsed.data;
      const facilityId = body.facilityId.trim();

      if (!(await app.guards.requireCapabilityAt(request, reply, "schedule.manage", facilityId))) {
        return reply;
      }

      const tenantId = request.tenant?.tenantId;
      if (!tenantId) {
        return reply.code(403).send({
          code: "forbidden",
          message: "Tenant context is required",
        });
      }

      const rawHeaderKey = request.headers["x-idempotency-key"] ?? request.headers["idempotency-key"];
      const headerIdempotencyKey =
        typeof rawHeaderKey === "string" && rawHeaderKey.trim().length > 0
          ? rawHeaderKey.trim()
          : undefined;

      const result = await bookCase({
        medplum: request.medplum,
        schedulingLock,
        tenantId,
        facilityId,
        body,
        headerIdempotencyKey,
        logger: request.log,
      });

      return reply.code(result.status).send(
        "data" in result
          ? result.data
          : {
              code: result.code,
              message: result.message,
              ...("details" in result ? { details: result.details } : {}),
              ...("reasons" in result ? { reasons: result.reasons } : {}),
            },
      );
    },
  );

  // GET /cases/:caseId — Fully hydrated Case Workspace detail bundle
  app.get<{ Params: CaseRouteParams; Querystring: CaseQuery }>(
    API_ROUTE_PATTERNS.case,
    { config: capabilityAtResource("case.read") },
    async (request: FastifyRequest<{ Params: CaseRouteParams; Querystring: CaseQuery }>, reply: FastifyReply) => {
      const { caseId } = request.params;
      const facilityId = resolveFacilityId(request);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to view a case",
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

      const detail = await getCaseDetail({
        medplum: request.medplum,
        facilityId,
        caseId,
      });

      if (!detail) {
        return reply.code(404).send({
          code: "not_found",
          message: `Case ${caseId} not found`,
        });
      }

      return reply.code(200).send(detail);
    },
  );

  // POST /cases/:caseId/transition — Validates and executes physical stage transitions
  app.post<{ Params: CaseRouteParams; Querystring: CaseQuery }>(
    API_ROUTE_PATTERNS.caseTransition,
    { config: capabilityAtResource("case.advance") },
    async (request: FastifyRequest<{ Params: CaseRouteParams; Querystring: CaseQuery }>, reply: FastifyReply) => {
      const { caseId } = request.params;
      const facilityId = resolveFacilityId(request);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to transition a case",
        });
      }

      if (!FHIR_ID.test(caseId)) {
        return reply.code(400).send({
          code: "invalid_case_id",
          message: "Invalid case ID format",
        });
      }

      if (!(await app.guards.requireCapabilityAt(request, reply, "case.advance", facilityId))) {
        return reply;
      }

      const parsed = transitionCaseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          code: "invalid_payload",
          message: "Invalid case transition payload",
          details: formatZodError(parsed.error),
        });
      }

      const result = await transitionCase({
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

      if (result.status === 409) {
        return reply.code(409).send({
          code: result.code,
          message: result.message,
          reasons: result.reasons,
        });
      }

      return reply.code(200).send(result.data);
    },
  );

  // POST /cases/:caseId/consent — Digital tablet informed consent capture (Phase P17)
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
    },
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
    },
  );

  // POST /cases/:caseId/preop-assessment — Pre-op bay nursing assessment (Phase P17)
  app.post<{ Params: CaseRouteParams; Querystring: CaseQuery }>(
    API_ROUTE_PATTERNS.casePreopAssessment,
    { config: capabilityAtResource("procedure.document") },
    async (request: FastifyRequest<{ Params: CaseRouteParams; Querystring: CaseQuery }>, reply: FastifyReply) => {
      const { caseId } = request.params;
      const parsed = preopAssessmentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          code: "invalid_payload",
          message: "Invalid pre-op assessment payload",
          details: formatZodError(parsed.error),
        });
      }

      const body: PreopAssessmentInput = parsed.data;
      const facilityId = resolveFacilityId(request, body.facilityId);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to submit pre-op assessment",
        });
      }

      if (!FHIR_ID.test(caseId)) {
        return reply.code(400).send({
          code: "invalid_case_id",
          message: "Invalid case ID format",
        });
      }

      if (!(await app.guards.requireCapabilityAt(request, reply, "procedure.document", facilityId))) {
        return reply;
      }

      const result = await submitPreopAssessment({
        medplum: request.medplum,
        facilityId,
        caseId,
        input: body,
        logger: request.log,
        performerId: request.principal?.id,
      });

      if (result.status === 404) {
        return reply.code(404).send({
          code: result.code,
          message: result.message,
        });
      }

      return reply.code(200).send(result);
    },
  );

  // POST /cases/:caseId/hp-update — Sign day-of H&P interval update note (Phase P16)
  app.post<{ Params: CaseRouteParams; Querystring: CaseQuery }>(
    API_ROUTE_PATTERNS.caseHpUpdate,
    { config: capabilityAtResource("procedure.document") },
    async (request: FastifyRequest<{ Params: CaseRouteParams; Querystring: CaseQuery }>, reply: FastifyReply) => {
      const { caseId } = request.params;
      const parsed = hpUpdateNoteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          code: "invalid_payload",
          message: "Invalid H&P update note payload",
          details: formatZodError(parsed.error),
        });
      }

      const body: HpUpdateNoteInput = parsed.data;
      const facilityId = resolveFacilityId(request, body.facilityId);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to submit H&P update note",
        });
      }

      if (!FHIR_ID.test(caseId)) {
        return reply.code(400).send({
          code: "invalid_case_id",
          message: "Invalid case ID format",
        });
      }

      if (!(await app.guards.requireCapabilityAt(request, reply, "procedure.document", facilityId))) {
        return reply;
      }

      const result = await submitHpUpdateNote({
        medplum: request.medplum,
        facilityId,
        caseId,
        input: body,
        logger: request.log,
        practitionerId: request.principal?.id,
        practitionerName: body.practitionerName,
      });

      if (result.status === 404) {
        return reply.code(404).send({
          code: result.code,
          message: result.message,
        });
      }

      return reply.code(200).send(result);
    },
  );

  // POST /cases/:caseId/hp-override — Attending physician clinical override of H&P validity (Phase P16)
  app.post<{ Params: CaseRouteParams; Querystring: CaseQuery }>(
    API_ROUTE_PATTERNS.caseHpOverride,
    { config: capabilityAtResource("case.advance") },
    async (request: FastifyRequest<{ Params: CaseRouteParams; Querystring: CaseQuery }>, reply: FastifyReply) => {
      const { caseId } = request.params;
      const parsed = hpOverrideSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          code: "invalid_payload",
          message: "Invalid H&P override payload",
          details: formatZodError(parsed.error),
        });
      }

      const body: HpOverrideInput = parsed.data;
      const facilityId = resolveFacilityId(request, body.facilityId);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to override H&P",
        });
      }

      if (!FHIR_ID.test(caseId)) {
        return reply.code(400).send({
          code: "invalid_case_id",
          message: "Invalid case ID format",
        });
      }

      if (!(await app.guards.requireCapabilityAt(request, reply, "case.advance", facilityId))) {
        return reply;
      }

      // Enforce role restriction: only attending physician or medical director can override H&P
      const grants = request.principal ? applicableGrants(request.principal, facilityId) : [];
      const userRoles = grants.flatMap((g) => g.roleKeys);
      const isAuthorizedPhysician = userRoles.some((r) => PERMITTED_HP_OVERRIDE_ROLES.includes(r));

      if (!isAuthorizedPhysician) {
        return reply.code(403).send({
          code: "forbidden",
          message: "H&P override requires attending physician or medical director role",
        });
      }

      const result = await submitHpOverride({
        medplum: request.medplum,
        facilityId,
        caseId,
        input: body,
        logger: request.log,
        actorId: request.principal?.id,
        actorName: body.practitionerName,
        actorRole: userRoles.find((r) => PERMITTED_HP_OVERRIDE_ROLES.includes(r)),
      });

      if (result.status === 403) {
        return reply.code(403).send({
          code: result.code,
          message: result.message,
        });
      }

      if (result.status === 404) {
        return reply.code(404).send({
          code: result.code,
          message: result.message,
        });
      }

      return reply.code(200).send(result);
    },
  );

  // POST /cases/:caseId/anticoagulation — Peri-procedural anticoagulation & antiplatelet assessment (Phase P16)
  app.post<{ Params: CaseRouteParams; Querystring: CaseQuery }>(
    API_ROUTE_PATTERNS.caseAnticoagulation,
    { config: capabilityAtResource("procedure.document") },
    async (request: FastifyRequest<{ Params: CaseRouteParams; Querystring: CaseQuery }>, reply: FastifyReply) => {
      const { caseId } = request.params;
      const parsed = anticoagulationAssessmentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          code: "invalid_payload",
          message: "Invalid anticoagulation assessment payload",
          details: formatZodError(parsed.error),
        });
      }

      const body: AnticoagulationAssessmentInput = parsed.data;
      const facilityId = resolveFacilityId(request, body.facilityId);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to submit anticoagulation assessment",
        });
      }

      if (!FHIR_ID.test(caseId)) {
        return reply.code(400).send({
          code: "invalid_case_id",
          message: "Invalid case ID format",
        });
      }

      if (!(await app.guards.requireCapabilityAt(request, reply, "procedure.document", facilityId))) {
        return reply;
      }

      const result = await submitAnticoagulationAssessment({
        medplum: request.medplum,
        facilityId,
        caseId,
        input: body,
        logger: request.log,
        assessorId: request.principal?.id,
        assessorName: body.assessorName,
      });

      if (result.status === 404) {
        return reply.code(404).send({
          code: result.code,
          message: result.message,
        });
      }

      return reply.code(200).send(result);
    },
  );

  // GET /cases/:caseId/hp — Retrieve pre-procedure H&P status and day-of update note details (Phase P16)
  app.get<{ Params: CaseRouteParams; Querystring: CaseQuery }>(
    API_ROUTE_PATTERNS.caseHp,
    { config: capabilityAtResource("case.read") },
    async (request: FastifyRequest<{ Params: CaseRouteParams; Querystring: CaseQuery }>, reply: FastifyReply) => {
      const { caseId } = request.params;
      const facilityId = resolveFacilityId(request);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to retrieve H&P details",
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

      const result = await getHpDetail({
        medplum: request.medplum,
        facilityId,
        caseId,
      });

      if (result.status === 404) {
        return reply.code(404).send({
          code: result.code,
          message: result.message,
        });
      }

      return reply.code(200).send(result.data);
    },
  );

  return Promise.resolve();
}
