import { API_ERROR_CODES } from "@asc/types";
import type { PatientSearchQuery, RegisterPatientInput } from "@asc/validation";
import type { FastifyReply, FastifyRequest } from "fastify";
import { resolveFacilityId } from "../routes/route-helpers.js";
import {
  defaultFallbackLock,
  registerPatientService,
  searchPatientsService,
} from "../services/patient-registration-service.js";

export const patientsController = {
  async searchPatients(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = (request.body ?? request.query) as PatientSearchQuery;
    const facilityId = request.facilityId ?? resolveFacilityId(request, query.facilityId, true);

    if (!(await request.server.guards.requireCapabilityAt(request, reply, "patient.read", facilityId))) {
      return reply;
    }

    const result = await searchPatientsService({
      medplum: request.medplum,
      facilityId,
      query,
      logger: request.log,
    });

    return reply.code(200).send(result);
  },

  async registerPatient(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = request.body as RegisterPatientInput;
    const facilityId = request.facilityId ?? resolveFacilityId(request, body.facilityId, false);

    if (facilityId === undefined) {
      return reply.sendApiError({
        code: API_ERROR_CODES.BAD_REQUEST,
        message: "Facility ID is required to register a patient.",
      });
    }

    if (!(await request.server.guards.requireCapabilityAt(request, reply, "patient.register", facilityId))) {
      return reply;
    }

    const registrationLock = request.server.facilityRegistrationLock ?? defaultFallbackLock;
    const isRetry = body.retry === true || request.headers["x-idempotent-retry"] === "true";

    const result = await registerPatientService({
      medplum: request.medplum,
      facilityId,
      body,
      isRetry,
      tenantId: request.tenant?.tenantId,
      logger: request.log,
      registrationLock,
    });

    if (result.status === 409) {
      return reply.sendApiError({
        code: result.code,
        status: 409,
        message: result.message,
        duplicateMatch: result.duplicateMatch,
      });
    }

    return reply.code(result.status).send(result.data);
  },
};
