import { forFacility } from "@asc/api-client/server";
import {
  evaluateScheduleConflict,
  isCancelledOrNoShow,
  type ScheduleSlot,
} from "@asc/clinical-rules/scheduling/conflicts";
import { API_ROUTE_PATTERNS } from "@asc/config";
import {
  buildAppointment,
  buildCaseEncounter,
  buildServiceRequest,
  createTransaction,
} from "@asc/fhir";
import type { FacilitySchedulingLock } from "@asc/types";
import {
  bookCaseSchema,
  formatZodError,
  type BookCaseInput,
} from "@asc/validation";
import type { WithId } from "@medplum/core";
import type { Appointment, Encounter, Patient } from "@medplum/fhirtypes";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";

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

declare module "fastify" {
  interface FastifyInstance {
    facilitySchedulingLock?: FacilitySchedulingLock;
  }
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

      return await schedulingLock.withLock(facilityId, async () => {
        const facilityAccountRef = `Organization/${facilityId}`;

        // 1. Strict Patient verification - fail fast if patient does not exist or lacks facility association
        let patient: Patient;
        try {
          patient = await request.medplum.readResource("Patient", body.patientId);
        } catch (readError) {
          request.log.warn(
            { patientId: body.patientId, error: readError instanceof Error ? readError.message : String(readError) },
            "patient not found during case booking",
          );
          return reply.code(404).send({
            code: "patient_not_found",
            message: `Patient with ID ${body.patientId} does not exist`,
          });
        }

        const hasFacilityAccount = patient.meta?.accounts?.some(
          (account) => account.reference === facilityAccountRef,
        );
        if (!hasFacilityAccount) {
          request.log.warn(
            { patientId: body.patientId, facilityId },
            "patient not associated with facility",
          );
          return reply.code(403).send({
            code: "facility_access_denied",
            message: `Patient ${body.patientId} is not registered or associated with facility ${facilityId}`,
          });
        }

        const candidateStartMs = Date.parse(body.scheduledAt);
        const windowStartIso = new Date(candidateStartMs - 24 * 60 * 60_000).toISOString();
        const windowEndIso = new Date(candidateStartMs + 24 * 60 * 60_000).toISOString();

        // 2. Fetch existing appointments covering the local facility window with pagination
        const allAppointments: Appointment[] = [];
        const pageSize = 100;
        let offset = 0;
        while (true) {
          const page = await request.medplum.searchResources("Appointment", [
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

        // 3. Durable booking idempotency check (matching patient, room, and scheduled time)
        const matchingExistingAppointment = facilityAppointments.find((appItem) => {
          if (isCancelledOrNoShow(appItem.status)) return false;
          const hasPatient = appItem.participant?.some(
            (p) => p.actor?.reference === `Patient/${body.patientId}`,
          );
          const hasRoom = appItem.participant?.some(
            (p) => p.actor?.reference === `Location/${body.roomId}`,
          );
          const matchesTime = appItem.start === body.scheduledAt;
          return hasPatient && hasRoom && matchesTime;
        });

        if (matchingExistingAppointment && matchingExistingAppointment.id) {
          const encounters = await request.medplum.searchResources("Encounter", [
            ["subject", `Patient/${body.patientId}`],
            ["_count", "50"],
          ]);
          const matchingEncounter = encounters.find(
            (enc) =>
              enc.appointment?.some((a) => a.reference === `Appointment/${matchingExistingAppointment.id}`) ||
              (enc.period?.start === body.scheduledAt &&
                enc.location?.some((l) => l.location?.reference === `Location/${body.roomId}`)),
          );
          const existingEncounterId = matchingEncounter?.id ?? matchingExistingAppointment.id;
          request.log.info(
            {
              facilityId,
              patientId: body.patientId,
              caseId: existingEncounterId,
              appointmentId: matchingExistingAppointment.id,
              roomId: body.roomId,
            },
            "idempotent case booking retry returned existing booking",
          );
          return reply.code(200).send({
            caseId: existingEncounterId,
            appointmentId: matchingExistingAppointment.id,
            encounterId: existingEncounterId,
            scheduledAt: body.scheduledAt,
            roomId: body.roomId,
          });
        }

        // 4. Convert existing appointments into schedule slots for pure conflict evaluation
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

        // 5. Conflict evaluation
        const conflictResult = evaluateScheduleConflict(candidateSlot, existingSlots);
        if (!conflictResult.ok) {
          const details: Record<string, string> = {};
          for (const reason of conflictResult.reasons) {
            details[reason.code] = reason.message;
          }

          return reply.code(409).send({
            code: "conflict",
            message: conflictResult.reasons.map((r) => r.message).join("; "),
            details,
            reasons: conflictResult.reasons,
          });
        }

        const endInstant = new Date(candidateEndMs).toISOString();
        const notes = body.notes?.trim() ? body.notes.trim() : undefined;

        // 6. Build atomic FHIR transaction bundle
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
          }),
          encounter: encounterRef,
        };
        tx.add("serviceRequest", serviceRequestResource);

        const bundle = tx.build();
        const writer = forFacility(request.medplum, facilityId);
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
        request.log.info(
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

        return reply.code(201).send({
          caseId: encounterId,
          appointmentId,
          encounterId,
          scheduledAt: body.scheduledAt,
          roomId: body.roomId,
        });
      });
    },
  );

  return Promise.resolve();
}
