import { grantedFacilityIds } from "@asc/authz";
import { facilityDateTimeToIso, todayIsoDate } from "@asc/clinical-rules/time";
import { API_ROUTE_PATTERNS } from "@asc/config";
import type {
  ProcedureCase,
  ScheduleDay,
  WhiteboardCard,
} from "@asc/types";
import { formatZodError, getScheduleQuerySchema } from "@asc/validation";
import type { Encounter, Patient as FhirPatient } from "@medplum/fhirtypes";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";
import { buildProcedureCaseFromFhir } from "../services/case-mapper.js";
import { computeRoomStatuses } from "./whiteboard.js";

const FHIR_ID = /^[A-Za-z0-9.-]{1,64}$/;

function resolveFacilityId(
  request: FastifyRequest,
  preferredFacilityId?: string,
): string | undefined {
  if (preferredFacilityId !== undefined && preferredFacilityId.trim() !== "") {
    const trimmed = preferredFacilityId.trim();
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

export function scheduleRoutes(app: FastifyInstance): Promise<void> {
  // GET /schedule — Date-bounded day-slate appointments, rooms, and procedure cases
  app.get(
    API_ROUTE_PATTERNS.schedule,
    { config: capabilityAtResource("schedule.read") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsedQuery = getScheduleQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({
          code: "invalid_query",
          message: "Invalid schedule query parameters",
          details: formatZodError(parsedQuery.error),
        });
      }

      const date = parsedQuery.data.date ?? todayIsoDate();
      const facilityId = resolveFacilityId(request, parsedQuery.data.facilityId);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to view the schedule",
        });
      }

      if (!(await app.guards.requireCapabilityAt(request, reply, "schedule.read", facilityId))) {
        return reply;
      }

      const startOfDayIso = facilityDateTimeToIso(date, "00:00");
      const endOfDayIso = facilityDateTimeToIso(date, "23:59");
      const facilityAccountRef = `Organization/${facilityId}`;

      const [appointments, encounters] = await Promise.all([
        request.medplum.searchResources("Appointment", [
          ["date", `ge${startOfDayIso}`],
          ["date", `le${endOfDayIso}`],
          ["_count", "250"],
        ]),
        request.medplum.searchResources("Encounter", [
          ["date", `ge${startOfDayIso}`],
          ["date", `le${endOfDayIso}`],
          ["_count", "250"],
        ]),
      ]);

      const filteredAppointments = appointments.filter((appItem) =>
        appItem.meta?.accounts?.some((account) => account.reference === facilityAccountRef),
      );

      const filteredEncounters = encounters.filter((enc) =>
        enc.meta?.accounts?.some((account) => account.reference === facilityAccountRef) ||
        enc.serviceProvider?.reference === facilityAccountRef,
      );

      const encounterByApptId = new Map<string, Encounter>();
      for (const enc of filteredEncounters) {
        if (enc.appointment) {
          for (const ref of enc.appointment) {
            if (ref.reference?.startsWith("Appointment/")) {
              encounterByApptId.set(ref.reference.replace("Appointment/", ""), enc);
            }
          }
        }
      }

      // Preload patient demographics via batch search to eliminate N+1 queries
      const missingPatientIds = new Set<string>();
      for (const appItem of filteredAppointments) {
        const patientParticipant = appItem.participant?.find((p) =>
          p.actor?.reference?.startsWith("Patient/"),
        );
        const patientId = patientParticipant?.actor?.reference
          ? patientParticipant.actor.reference.replace("Patient/", "")
          : undefined;
        if (patientId) {
          missingPatientIds.add(patientId);
        }
      }

      const patientMap = new Map<string, FhirPatient>();
      if (missingPatientIds.size > 0) {
        try {
          const patientIdList = Array.from(missingPatientIds);
          const chunkSize = 50;
          for (let i = 0; i < patientIdList.length; i += chunkSize) {
            const chunk = patientIdList.slice(i, i + chunkSize);
            const patients = await request.medplum.searchResources("Patient", [
              ["_id", chunk.join(",")],
              ["_count", String(chunk.length)],
            ]);
            for (const patient of patients) {
              if (patient.id) {
                patientMap.set(patient.id, patient);
              }
            }
          }
        } catch {
          // Graceful fallback when batch lookup fails
        }
      }

      const whiteboardCards: WhiteboardCard[] = [];
      const cases: ProcedureCase[] = [];

      for (const appItem of filteredAppointments) {
        const linkedEncounter = appItem.id ? encounterByApptId.get(appItem.id) : undefined;
        const patientParticipant = appItem.participant?.find((p) =>
          p.actor?.reference?.startsWith("Patient/"),
        );
        const patientId = patientParticipant?.actor?.reference
          ? patientParticipant.actor.reference.replace("Patient/", "")
          : undefined;

        const fhirPatient = patientId ? patientMap.get(patientId) : undefined;

        const procedureCase = buildProcedureCaseFromFhir({
          appItem,
          encounter: linkedEncounter,
          fhirPatient,
        });

        cases.push(procedureCase);

        const whiteboardCard: WhiteboardCard = {
          caseId: procedureCase.id,
          caseNumber: procedureCase.caseNumber,
          initials: procedureCase.patient.initials,
          phase: procedureCase.phase,
          roomId: procedureCase.roomId,
          procedureLabel: procedureCase.procedureLabel,
          scheduledStart: procedureCase.scheduledStart,
          phaseEnteredAt: linkedEncounter?.period?.start ?? appItem.start,
          surgeonInitials: procedureCase.team.surgeon.initials,
          flags: [],
        };

        whiteboardCards.push(whiteboardCard);
      }

      const rooms = computeRoomStatuses(whiteboardCards);

      const scheduleDay: ScheduleDay = {
        date,
        rooms,
        cases,
      };

      return reply.code(200).send(scheduleDay);
    },
  );

  return Promise.resolve();
}
