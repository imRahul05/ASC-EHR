import { forFacility } from "@asc/api-client/server";
import {
  evaluateScheduleConflict,
  type ScheduleSlot,
} from "@asc/clinical-rules/scheduling/conflicts";
import { API_ROUTE_PATTERNS } from "@asc/config";
import {
  buildAppointment,
  buildCaseEncounter,
  buildServiceRequest,
  createTransaction,
} from "@asc/fhir";
import {
  bookCaseSchema,
  formatZodError,
  type BookCaseInput,
} from "@asc/validation";
import type { WithId } from "@medplum/core";
import type { Appointment, Encounter } from "@medplum/fhirtypes";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";

export function casesRoutes(app: FastifyInstance): Promise<void> {
  // POST /cases — Book a surgical case into an operating room (Phase P15a)
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

      const facilityAccountRef = `Organization/${facilityId}`;
      const scheduledDate = body.scheduledAt.slice(0, 10);

      // Fetch existing appointments for the same day and facility
      const existingAppointments = await request.medplum.searchResources("Appointment", {
        date: scheduledDate,
        _count: "250",
      });

      const facilityAppointments = existingAppointments.filter((appointment) =>
        appointment.meta?.accounts?.some((account) => account.reference === facilityAccountRef),
      );

      // Convert existing appointments into schedule slots for pure conflict evaluation
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

      const candidateStartMs = Date.parse(body.scheduledAt);
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

      // Pure conflict evaluation with zero DB dependencies
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

      // Check if patient exists and whether facility account needs to be stamped
      try {
        const patient = await request.medplum.readResource("Patient", body.patientId);
        const hasFacilityAccount = patient.meta?.accounts?.some(
          (account) => account.reference === facilityAccountRef,
        );
        if (!hasFacilityAccount) {
          const existingAccounts = patient.meta?.accounts ?? [];
          const updatedAccounts = [...existingAccounts, { reference: facilityAccountRef }];
          try {
            await request.medplum.post(
              `fhir/R4/Patient/${patient.id}/$set-accounts`,
              { accounts: updatedAccounts },
            );
          } catch {
            await forFacility(request.medplum, facilityId).update({
              ...patient,
              meta: {
                ...patient.meta,
                accounts: updatedAccounts,
              },
            });
          }
          request.log.info({ patientId: patient.id, facilityId }, "patient facility added");
        }
      } catch (readError) {
        const message = readError instanceof Error ? readError.message : String(readError);
        request.log.warn({ patientId: body.patientId, error: message }, "patient read or account check encountered non-fatal error");
      }

      const endInstant = new Date(candidateEndMs).toISOString();
      const notes = body.notes?.trim() ? body.notes.trim() : undefined;

      // Build atomic FHIR transaction bundle
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
    },
  );

  return Promise.resolve();
}
