import { API_ROUTE_PATTERNS } from "@asc/config";
import type { FacilityRegistrationLock } from "@asc/types";
import {
  patientSearchQuerySchema,
  registerPatientSchema,
} from "@asc/validation";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";
import { patientsController } from "../controllers/patients.controller.js";
import { validateBody, validateQuery } from "../hooks/validation.js";

import { requireIdempotency } from "../hooks/idempotency.js";

// export
export {
  createInMemoryRegistrationLock,
  defaultFallbackLock,
  isAmbiguousNetworkError,
  withFacilityRegistrationLock,
} from "../services/patient-registration-service.js";

declare module "fastify" {
  interface FastifyInstance {
    facilityRegistrationLock?: FacilityRegistrationLock;
  }
}

export function patientsRoutes(app: FastifyInstance): Promise<void> {
  // POST /patients/search (PHI-safe demographic search via POST body per COMPLIANCE_AND_PHI §4)
  app.post(
    API_ROUTE_PATTERNS.patientsSearch,
    {
      config: capabilityAtResource("patient.read"),
      preHandler: [validateBody(patientSearchQuerySchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return patientsController.searchPatients(request, reply);
    },
  );

  // GET /patients/search (preserved for backward compatibility with query params sanitized by logger)
  app.get(
    API_ROUTE_PATTERNS.patientsSearch,
    {
      config: capabilityAtResource("patient.read"),
      preHandler: [validateQuery(patientSearchQuerySchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return patientsController.searchPatients(request, reply);
    },
  );

  // POST /patients/register
  app.post(
    API_ROUTE_PATTERNS.patientsRegister,
    {
      config: capabilityAtResource("patient.register"),
      preHandler: [requireIdempotency, validateBody(registerPatientSchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return patientsController.registerPatient(request, reply);
    },
  );


  return Promise.resolve();
}
