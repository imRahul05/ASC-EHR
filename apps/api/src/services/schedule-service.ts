import { facilityDateTimeToIso, todayIsoDate } from "@asc/clinical-rules/time";
import type { ProcedureCase, ScheduleDay, WhiteboardCard } from "@asc/types";
import type { MedplumClient } from "@medplum/core";
import type { Encounter, Patient as FhirPatient } from "@medplum/fhirtypes";
import type { FastifyBaseLogger } from "fastify";
import { buildProcedureCaseFromFhir } from "./case-mapper.js";
import { computeRoomStatuses } from "./whiteboard-service.js";

interface GetScheduleDayParams {
  readonly medplum: MedplumClient;
  readonly facilityId: string;
  readonly date?: string;
  readonly logger?: FastifyBaseLogger;
}


export async function getScheduleDay(params: GetScheduleDayParams): Promise<ScheduleDay> {
  const { medplum, facilityId, date = todayIsoDate() } = params;

  const startOfDayIso = facilityDateTimeToIso(date, "00:00");
  const endOfDayIso = facilityDateTimeToIso(date, "23:59");
  const facilityAccountRef = `Organization/${facilityId}`;

  const [appointments, encounters] = await Promise.all([
    medplum.searchResources("Appointment", [
      ["date", `ge${startOfDayIso}`],
      ["date", `le${endOfDayIso}`],
      ["_count", "250"],
    ]),
    medplum.searchResources("Encounter", [
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
        const patients = await medplum.searchResources("Patient", [
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

  return {
    date,
    rooms,
    cases,
  };
}
