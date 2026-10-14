import { forFacility } from "@asc/api-client/server";
import {
  ASC_ROOM_IDS,
  evaluateScheduleConflict,
  type AscRoomId,
  type ScheduleSlot,
} from "@asc/clinical-rules/scheduling/conflicts";
import {
  buildAppointment,
  buildCaseEncounter,
  buildServiceRequest,
  createTransaction,
  fhirUrls,
} from "@asc/fhir";
import type { FacilitySchedulingLock, RuleReason } from "@asc/types";
import type { BookCaseInput, BookCaseResult } from "@asc/validation";
import type { MedplumClient, WithId } from "@medplum/core";
import type { Appointment, Encounter, Patient, Practitioner } from "@medplum/fhirtypes";
import type { FastifyBaseLogger } from "fastify";

import { classifyMedplumReadError } from "./medplum-error-classifier.js";

type CaseBookingResult =
  | { readonly status: 201 | 200; readonly data: BookCaseResult }
  | {
      readonly status: number;
      readonly code: string;
      readonly message: string;
      readonly details?: Record<string, string>;
      readonly reasons?: readonly RuleReason[];
    };

interface BookCaseOptions {
  readonly medplum: MedplumClient;
  readonly schedulingLock: FacilitySchedulingLock;
  readonly tenantId: string;
  readonly facilityId: string;
  readonly body: BookCaseInput;
  readonly headerIdempotencyKey?: string | undefined;
  readonly logger: FastifyBaseLogger;
}

export function createInMemorySchedulingLock(): FacilitySchedulingLock {
  const queues = new Map<string, Promise<void>>();
  return {
    async withLock<T>(facilityId: string, operation: () => Promise<T>): Promise<T> {
      const previous = queues.get(facilityId) ?? Promise.resolve();
      let release: () => void = () => {};
      const current = new Promise<void>((resolve) => {
        release = resolve;
      });
      queues.set(facilityId, current);

      try {
        await previous.catch(() => {});
        return await operation();
      } finally {
        release();
        if (queues.get(facilityId) === current) {
          queues.delete(facilityId);
        }
      }
    },
  };
}

async function checkIdempotency(
  medplum: MedplumClient,
  idempotencyKey: string,
  facilityAccountRef: string,
  patientId: string,
  roomId: string,
  scheduledAt: string,
  logger: FastifyBaseLogger,
): Promise<CaseBookingResult | undefined> {
  const idempotencySystem = fhirUrls.identifierSystem("booking-idempotency-key");
  const existingAppts = await medplum.searchResources("Appointment", [
    ["identifier", `${idempotencySystem}|${idempotencyKey}`],
    ["_count", "10"],
  ]);

  if (existingAppts.length === 0) {
    return undefined;
  }

  const existingAppt = existingAppts[0];
  if (!existingAppt || !existingAppt.id) {
    return {
      status: 500,
      code: "incomplete_transaction",
      message: "Existing booking appointment has no identifier",
    };
  }

  const matchesFacility = existingAppt.meta?.accounts?.some(
    (a) => a.reference === facilityAccountRef,
  );
  const matchesPatient = existingAppt.participant?.some(
    (p) => p.actor?.reference === `Patient/${patientId}`,
  );

  if (!matchesFacility || !matchesPatient) {
    return {
      status: 409,
      code: "idempotency_key_conflict",
      message: `Idempotency key '${idempotencyKey}' was already used for a different patient or facility`,
    };
  }

  const [existingEncounters, existingServiceRequests] = await Promise.all([
    medplum.searchResources("Encounter", [
      ["identifier", `${idempotencySystem}|${idempotencyKey}`],
      ["_count", "10"],
    ]),
    medplum.searchResources("ServiceRequest", [
      ["identifier", `${idempotencySystem}|${idempotencyKey}`],
      ["_count", "10"],
    ]),
  ]);

  let matchingEncounter = existingEncounters[0];
  if (!matchingEncounter || !matchingEncounter.id) {
    const byAppt = await medplum.searchResources("Encounter", [
      ["appointment", `Appointment/${existingAppt.id}`],
      ["_count", "10"],
    ]);
    matchingEncounter = byAppt[0];
  }

  if (!matchingEncounter || !matchingEncounter.id) {
    logger.error(
      { appointmentId: existingAppt.id, idempotencyKey },
      "idempotent retry found appointment without linked encounter",
    );
    return {
      status: 500,
      code: "incomplete_transaction",
      message: "Previous booking transaction was incomplete; encounter is missing. Manual reconciliation required.",
    };
  }

  const matchingServiceRequest = existingServiceRequests[0];
  if (!matchingServiceRequest || !matchingServiceRequest.id) {
    logger.error(
      { appointmentId: existingAppt.id, encounterId: matchingEncounter.id, idempotencyKey },
      "idempotent retry found appointment and encounter without linked service request",
    );
    return {
      status: 500,
      code: "incomplete_transaction",
      message: "Previous booking transaction was incomplete; service request is missing. Manual reconciliation required.",
    };
  }

  logger.info(
    {
      facilityId: facilityAccountRef.replace("Organization/", ""),
      patientId,
      caseId: matchingEncounter.id,
      appointmentId: existingAppt.id,
      roomId,
      idempotencyKey,
    },
    "idempotent case booking retry returned verified existing booking",
  );

  return {
    status: 200,
    data: {
      caseId: matchingEncounter.id,
      appointmentId: existingAppt.id,
      encounterId: matchingEncounter.id,
      scheduledAt: existingAppt.start ?? scheduledAt,
      roomId,
    },
  };
}

/**
 * Orchestrates surgical case booking with distributed locking, double-checked idempotency,
 * patient/practitioner verification, schedule conflict evaluation, and atomic FHIR bundle execution.
 */
export async function bookCase(options: BookCaseOptions): Promise<CaseBookingResult> {
  const { medplum, schedulingLock, tenantId, facilityId, body, headerIdempotencyKey, logger } = options;

  if (!ASC_ROOM_IDS.includes(body.roomId as AscRoomId)) {
    return {
      status: 400,
      code: "invalid_room",
      message: `Room ID '${body.roomId}' is not a valid ASC procedure room. Supported rooms: ${ASC_ROOM_IDS.join(", ")}`,
    };
  }

  const facilityAccountRef = `Organization/${facilityId}`;

  const idempotencyKey =
    headerIdempotencyKey ??
    (body.idempotencyKey && body.idempotencyKey.trim().length > 0 ? body.idempotencyKey.trim() : undefined);

  // 1. Fast-path check: Check idempotency OUTSIDE the lock (zero lock contention on retries)
  if (idempotencyKey !== undefined) {
    const fastPathResult = await checkIdempotency(
      medplum,
      idempotencyKey,
      facilityAccountRef,
      body.patientId,
      body.roomId,
      body.scheduledAt,
      logger,
    );
    if (fastPathResult !== undefined) {
      return fastPathResult;
    }
  }

  // 2. Acquire facility lock for atomic check and reservation
  return await schedulingLock.withLock(
    facilityId,
    async () => {
      // 2a. Double-checked re-check inside lock
      if (idempotencyKey !== undefined) {
        const lockedRecheckResult = await checkIdempotency(
          medplum,
          idempotencyKey,
          facilityAccountRef,
          body.patientId,
          body.roomId,
          body.scheduledAt,
          logger,
        );
        if (lockedRecheckResult !== undefined) {
          return lockedRecheckResult;
        }
      }

      // 2b. Strict Patient verification - fail fast if patient does not exist or lacks facility association
      let patient: Patient;
      try {
        patient = await medplum.readResource("Patient", body.patientId);
      } catch (readError) {
        const classified = classifyMedplumReadError(
          readError instanceof Error ? readError : new Error(String(readError)),
          "patient",
          body.patientId,
        );
        logger.warn(
          { patientId: body.patientId, classified },
          "patient read failed during case booking",
        );
        return {
          status: classified.status,
          code: classified.code,
          message: classified.message,
        };
      }

      const hasFacilityAccount = patient.meta?.accounts?.some(
        (account) => account.reference === facilityAccountRef,
      );
      if (!hasFacilityAccount) {
        logger.warn(
          { patientId: body.patientId, facilityId },
          "patient not associated with facility",
        );
        return {
          status: 403,
          code: "facility_access_denied",
          message: `Patient ${body.patientId} is not registered or associated with facility ${facilityId}`,
        };
      }

      // 2c. Validate primary physician exists and is active
      let primaryPhysician: Practitioner;
      try {
        primaryPhysician = await medplum.readResource("Practitioner", body.primaryPhysicianId);
      } catch (readError) {
        const classified = classifyMedplumReadError(
          readError instanceof Error ? readError : new Error(String(readError)),
          "primary_physician",
          body.primaryPhysicianId,
        );
        return {
          status: classified.status,
          code: classified.code,
          message: classified.message,
        };
      }

      if (primaryPhysician.active === false) {
        return {
          status: 400,
          code: "inactive_or_invalid_practitioner",
          message: `Primary physician ${body.primaryPhysicianId} is marked inactive`,
        };
      }

      // 2d. Validate anesthesiologist if provided
      if (body.anesthesiologistId) {
        let anesthesiologist: Practitioner;
        try {
          anesthesiologist = await medplum.readResource("Practitioner", body.anesthesiologistId);
        } catch (readError) {
          const classified = classifyMedplumReadError(
            readError instanceof Error ? readError : new Error(String(readError)),
            "anesthesiologist",
            body.anesthesiologistId,
          );
          return {
            status: classified.status,
            code: classified.code,
            message: classified.message,
          };
        }

        if (anesthesiologist.active === false) {
          return {
            status: 400,
            code: "inactive_or_invalid_practitioner",
            message: `Anesthesiologist ${body.anesthesiologistId} is marked inactive`,
          };
        }
      }

      const candidateStartMs = Date.parse(body.scheduledAt);
      const windowStartIso = new Date(candidateStartMs - 24 * 60 * 60_000).toISOString();
      const windowEndIso = new Date(candidateStartMs + 24 * 60 * 60_000).toISOString();

      // 2e. Fetch existing appointments covering the local facility window with pagination
      const allAppointments: Appointment[] = [];
      const pageSize = 100;
      let offset = 0;
      while (true) {
        const page = await medplum.searchResources("Appointment", [
          ["date", `ge${windowStartIso}`],
          ["date", `le${windowEndIso}`],
          ["_count", String(pageSize)],
          ["_offset", String(offset)],
        ]);
        allAppointments.push(...page);
        if (page.length < pageSize) {
          break;
        }
        offset += page.length;
      }

      const facilityAppointments = allAppointments.filter((appointment) =>
        appointment.meta?.accounts?.some((account) => account.reference === facilityAccountRef),
      );

      // 2f. Convert existing appointments into schedule slots for pure conflict evaluation
      const existingSlots: ScheduleSlot[] = facilityAppointments.map((appItem) => {
        const startMs = appItem.start ? Date.parse(appItem.start) : 0;
        const parsedEndMs = appItem.end ? Date.parse(appItem.end) : 0;
        const endMs = startMs > 0 && parsedEndMs > startMs ? parsedEndMs : undefined;
        const durationMinutes =
          endMs !== undefined ? Math.round((endMs - startMs) / 60_000) : 45;

        const roomParticipant = appItem.participant?.find((p) =>
          p.actor?.reference?.startsWith("Location/"),
        );
        const roomId = roomParticipant?.actor?.reference
          ? roomParticipant.actor.reference.replace("Location/", "")
          : "";

        const practitionerParticipants =
          appItem.participant?.filter((p) => p.actor?.reference?.startsWith("Practitioner/")) ?? [];

        const primaryPerformer =
          practitionerParticipants.find((p) =>
            p.type?.some((t) => t.coding?.some((c) => c.code === "PPRF")),
          ) ?? practitionerParticipants[0];

        const secondaryPerformer =
          practitionerParticipants.find((p) =>
            p.type?.some((t) => t.coding?.some((c) => c.code === "SPRF" || c.code === "ANESTH")),
          ) ?? (practitionerParticipants.length > 1 ? practitionerParticipants[1] : undefined);

        const primaryPhysicianId = primaryPerformer?.actor?.reference
          ? primaryPerformer.actor.reference.replace("Practitioner/", "")
          : "";

        const anesthesiologistId = secondaryPerformer?.actor?.reference
          ? secondaryPerformer.actor.reference.replace("Practitioner/", "")
          : undefined;

        return {
          id: appItem.id,
          roomId,
          startMs,
          endMs,
          durationMinutes,
          primaryPhysicianId,
          anesthesiologistId,
          status: appItem.status,
        };
      });

      const durationMinutes = body.durationMinutes;
      const candidateEndMs = candidateStartMs + durationMinutes * 60_000;

      const candidateSlot: ScheduleSlot = {
        roomId: body.roomId,
        startMs: candidateStartMs,
        endMs: candidateEndMs,
        durationMinutes,
        primaryPhysicianId: body.primaryPhysicianId,
        anesthesiologistId: body.anesthesiologistId,
      };

      // 2g. Conflict evaluation
      const conflictResult = evaluateScheduleConflict(candidateSlot, existingSlots);
      if (!conflictResult.ok) {
        const details: Record<string, string> = {};
        for (const reason of conflictResult.reasons) {
          details[reason.code] = reason.message;
        }

        return {
          status: 409,
          code: "conflict",
          message: conflictResult.reasons.map((r) => r.message).join("; "),
          details,
          reasons: conflictResult.reasons,
        };
      }

      const endInstant = new Date(candidateEndMs).toISOString();
      const notes = body.notes?.trim() ? body.notes.trim() : undefined;

      // 2h. Build atomic FHIR transaction bundle
      const tx = createTransaction({ facilityId });
      const appointmentRef = tx.ref<Appointment>("appointment");
      const encounterRef = tx.ref<Encounter>("encounter");

      const appointmentResource = buildAppointment({
        facilityId,
        patientId: body.patientId,
        start: body.scheduledAt,
        end: endInstant,
        roomId: body.roomId,
        physicianId: body.primaryPhysicianId,
        anesthesiologistId: body.anesthesiologistId,
        description: notes,
        idempotencyKey,
      });
      tx.add("appointment", appointmentResource);

      const encounterResource = {
        ...buildCaseEncounter({
          facilityId,
          patientId: body.patientId,
          stage: "scheduled",
          locationId: body.roomId,
          start: body.scheduledAt,
          end: endInstant,
          idempotencyKey,
        }),
        appointment: [appointmentRef],
      };
      tx.add("encounter", encounterResource);

      const serviceRequestResource = {
        ...buildServiceRequest({
          facilityId,
          patientId: body.patientId,
          procedureIntent: body.procedureIntent,
          primaryProcedureCode: body.primaryProcedureCode,
          secondaryProcedureCodes: body.secondaryProcedureCodes,
          requesterId: body.primaryPhysicianId,
          notes,
          authoredOn: new Date().toISOString(),
          idempotencyKey,
          basedOnId: body.referralId,
        }),
        encounter: encounterRef,
      };
      tx.add("serviceRequest", serviceRequestResource);

      const bundle = tx.build();
      const writer = forFacility(medplum, facilityId);
      const responseBundle = await writer.transaction(bundle);

      const parseIdFromLocation = (loc?: string): string | undefined => {
        if (!loc) return undefined;
        const parts = loc.split("/");
        return parts.length >= 2 ? parts[1] : undefined;
      };

      const createdAppointment = responseBundle.entry?.[0]?.resource as WithId<Appointment> | undefined;
      const appointmentId =
        createdAppointment?.id ?? parseIdFromLocation(responseBundle.entry?.[0]?.response?.location);

      const createdEncounter = responseBundle.entry?.[1]?.resource as WithId<Encounter> | undefined;
      const encounterId =
        createdEncounter?.id ?? parseIdFromLocation(responseBundle.entry?.[1]?.response?.location);

      if (!appointmentId || !encounterId) {
        throw new Error("Transaction succeeded but appointment or encounter ID could not be resolved");
      }

      // Structured PHI-safe audit logging (IDs, room, timestamps only)
      logger.info(
        {
          facilityId,
          patientId: body.patientId,
          caseId: encounterId,
          appointmentId,
          encounterId,
          roomId: body.roomId,
          scheduledAt: body.scheduledAt,
        },
        "case booked successfully",
      );

      return {
        status: 201,
        data: {
          caseId: encounterId,
          appointmentId,
          encounterId,
          scheduledAt: body.scheduledAt,
          roomId: body.roomId,
        },
      };
    },
    tenantId,
  );
}
