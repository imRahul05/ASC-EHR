import { forFacility } from "@asc/api-client/server";
import {
  ASC_ROOM_IDS,
  evaluateScheduleConflict,
  type AscRoomId,
  type ScheduleSlot,
} from "@asc/clinical-rules/scheduling/conflicts";
import { API_ROUTE_PATTERNS } from "@asc/config";
import {
  buildAppointment,
  buildCaseEncounter,
  buildServiceRequest,
  createTransaction,
  fhirUrls,
} from "@asc/fhir";
import type { FacilitySchedulingLock } from "@asc/types";
import {
  bookCaseSchema,
  formatZodError,
  type BookCaseInput,
} from "@asc/validation";
import type { WithId } from "@medplum/core";
import type { Appointment, Encounter, Patient, Practitioner } from "@medplum/fhirtypes";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";

interface ClassifiedReadError {
  readonly status: number;
  readonly code: string;
  readonly message: string;
}

export function classifyMedplumReadError(
  error: Error,
  resourceKind: "patient" | "primary_physician" | "anesthesiologist",
  resourceId: string,
): ClassifiedReadError {
  const err = error as Error & {
    readonly status?: number;
    readonly statusCode?: number;
    readonly outcome?: {
      readonly issue?: ReadonlyArray<{
        readonly severity?: string;
        readonly code?: string;
        readonly details?: { readonly text?: string };
      }>;
    };
  };

  const status = err.status ?? err.statusCode;
  const isNotFound =
    status === 404 ||
    err.outcome?.issue?.some((i) => i.code === "not-found") ||
    err.message.toLowerCase().includes("not found");

  if (isNotFound) {
    return {
      status: 404,
      code: `${resourceKind}_not_found`,
      message: `${resourceKind.replace("_", " ")} with ID ${resourceId} does not exist`,
    };
  }

  const isForbidden =
    status === 403 ||
    status === 401 ||
    err.outcome?.issue?.some((i) => i.code === "security" || i.code === "forbidden") ||
    err.message.toLowerCase().includes("forbidden") ||
    err.message.toLowerCase().includes("unauthorized");

  if (isForbidden) {
    return {
      status: 403,
      code: "forbidden",
      message: `Access denied reading ${resourceKind.replace("_", " ")} ${resourceId}`,
    };
  }

  const isUnavailable =
    status === 503 ||
    status === 502 ||
    status === 504 ||
    err.message.toLowerCase().includes("econnrefused") ||
    err.message.toLowerCase().includes("timeout") ||
    err.message.toLowerCase().includes("unavailable") ||
    err.message.toLowerCase().includes("network");

  if (isUnavailable) {
    return {
      status: 503,
      code: "upstream_service_unavailable",
      message: "Upstream clinical data service is temporarily unavailable",
    };
  }

  return {
    status: 500,
    code: "internal_error",
    message: `Unexpected error reading ${resourceKind.replace("_", " ")}`,
  };
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

      const tenantId = request.tenant?.tenantId;
      if (!tenantId) {
        return reply.code(403).send({
          code: "forbidden",
          message: "Tenant context is required",
        });
      }

      if (!ASC_ROOM_IDS.includes(body.roomId as AscRoomId)) {
        return reply.code(400).send({
          code: "invalid_room",
          message: `Room ID '${body.roomId}' is not a valid ASC procedure room. Supported rooms: ${ASC_ROOM_IDS.join(", ")}`,
        });
      }

      return await schedulingLock.withLock(
        facilityId,
        async () => {
          const facilityAccountRef = `Organization/${facilityId}`;

        // 1. Strict Patient verification - fail fast if patient does not exist, errors, or lacks facility association
        let patient: Patient;
        try {
          patient = await request.medplum.readResource("Patient", body.patientId);
        } catch (readError) {
          const classified = classifyMedplumReadError(
            readError instanceof Error ? readError : new Error(String(readError)),
            "patient",
            body.patientId,
          );
          request.log.warn(
            { patientId: body.patientId, classified },
            "patient read failed during case booking",
          );
          return reply.code(classified.status).send({
            code: classified.code,
            message: classified.message,
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

        // 2. Validate primary physician exists and is active
        let primaryPhysician: Practitioner;
        try {
          primaryPhysician = await request.medplum.readResource("Practitioner", body.primaryPhysicianId);
        } catch (readError) {
          const classified = classifyMedplumReadError(
            readError instanceof Error ? readError : new Error(String(readError)),
            "primary_physician",
            body.primaryPhysicianId,
          );
          return reply.code(classified.status).send({
            code: classified.code,
            message: classified.message,
          });
        }

        if (primaryPhysician.active === false) {
          return reply.code(400).send({
            code: "inactive_or_invalid_practitioner",
            message: `Primary physician ${body.primaryPhysicianId} is marked inactive`,
          });
        }

        // 3. Validate anesthesiologist if provided
        if (body.anesthesiologistId) {
          let anesthesiologist: Practitioner;
          try {
            anesthesiologist = await request.medplum.readResource("Practitioner", body.anesthesiologistId);
          } catch (readError) {
            const classified = classifyMedplumReadError(
              readError instanceof Error ? readError : new Error(String(readError)),
              "anesthesiologist",
              body.anesthesiologistId,
            );
            return reply.code(classified.status).send({
              code: classified.code,
              message: classified.message,
            });
          }

          if (anesthesiologist.active === false) {
            return reply.code(400).send({
              code: "inactive_or_invalid_practitioner",
              message: `Anesthesiologist ${body.anesthesiologistId} is marked inactive`,
            });
          }
        }

        // 4. Durable booking idempotency check
        const rawHeaderKey = request.headers["x-idempotency-key"] ?? request.headers["idempotency-key"];
        const headerIdempotencyKey =
          typeof rawHeaderKey === "string" && rawHeaderKey.trim().length > 0
            ? rawHeaderKey.trim()
            : undefined;
        const idempotencyKey =
          headerIdempotencyKey ??
          (body.idempotencyKey && body.idempotencyKey.trim().length > 0 ? body.idempotencyKey.trim() : undefined);

        const idempotencySystem = fhirUrls.identifierSystem("booking-idempotency-key");

        if (idempotencyKey !== undefined) {
          const existingAppts = await request.medplum.searchResources("Appointment", [
            ["identifier", `${idempotencySystem}|${idempotencyKey}`],
            ["_count", "10"],
          ]);

          if (existingAppts.length > 0) {
            const existingAppt = existingAppts[0];
            if (!existingAppt || !existingAppt.id) {
              return reply.code(500).send({
                code: "incomplete_transaction",
                message: "Existing booking appointment has no identifier",
              });
            }

            const matchesFacility = existingAppt.meta?.accounts?.some(
              (a) => a.reference === facilityAccountRef,
            );
            const matchesPatient = existingAppt.participant?.some(
              (p) => p.actor?.reference === `Patient/${body.patientId}`,
            );

            if (!matchesFacility || !matchesPatient) {
              return reply.code(409).send({
                code: "idempotency_key_conflict",
                message: `Idempotency key '${idempotencyKey}' was already used for a different patient or facility`,
              });
            }

            const existingEncounters = await request.medplum.searchResources("Encounter", [
              ["identifier", `${idempotencySystem}|${idempotencyKey}`],
              ["_count", "10"],
            ]);
            const matchingEncounter =
              existingEncounters[0] ??
              (
                await request.medplum.searchResources("Encounter", [
                  ["appointment", `Appointment/${existingAppt.id}`],
                  ["_count", "10"],
                ])
              )[0];

            if (!matchingEncounter || !matchingEncounter.id) {
              request.log.error(
                { appointmentId: existingAppt.id, idempotencyKey },
                "idempotent retry found appointment without linked encounter",
              );
              return reply.code(500).send({
                code: "incomplete_transaction",
                message: "Previous booking transaction was incomplete; encounter is missing. Manual reconciliation required.",
              });
            }

            const existingServiceRequests = await request.medplum.searchResources("ServiceRequest", [
              ["identifier", `${idempotencySystem}|${idempotencyKey}`],
              ["_count", "10"],
            ]);
            const matchingServiceRequest = existingServiceRequests[0];
            if (!matchingServiceRequest || !matchingServiceRequest.id) {
              request.log.error(
                { appointmentId: existingAppt.id, encounterId: matchingEncounter.id, idempotencyKey },
                "idempotent retry found appointment and encounter without linked service request",
              );
              return reply.code(500).send({
                code: "incomplete_transaction",
                message: "Previous booking transaction was incomplete; service request is missing. Manual reconciliation required.",
              });
            }

            request.log.info(
              {
                facilityId,
                patientId: body.patientId,
                caseId: matchingEncounter.id,
                appointmentId: existingAppt.id,
                roomId: body.roomId,
                idempotencyKey,
              },
              "idempotent case booking retry returned verified existing booking",
            );
            return reply.code(200).send({
              caseId: matchingEncounter.id,
              appointmentId: existingAppt.id,
              encounterId: matchingEncounter.id,
              scheduledAt: existingAppt.start ?? body.scheduledAt,
              roomId: body.roomId,
            });
          }
        }

        const candidateStartMs = Date.parse(body.scheduledAt);
        const windowStartIso = new Date(candidateStartMs - 24 * 60 * 60_000).toISOString();
        const windowEndIso = new Date(candidateStartMs + 24 * 60 * 60_000).toISOString();

        // 5. Fetch existing appointments covering the local facility window with pagination
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

        // 6. Convert existing appointments into schedule slots for pure conflict evaluation
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
      tenantId,
    );
    },
  );

  return Promise.resolve();
}
