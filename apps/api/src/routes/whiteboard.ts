import { grantedFacilityIds } from "@asc/authz";
import { facilityDateTimeToIso, todayIsoDate } from "@asc/clinical-rules/time";
import { API_ROUTE_PATTERNS } from "@asc/config";
import { casePhaseFromCode } from "@asc/fhir/case-phase";
import type { CasePhase, Room, WhiteboardBoard, WhiteboardCard } from "@asc/types";
import type { Encounter } from "@medplum/fhirtypes";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";

const DEFAULT_ROOMS: readonly Room[] = [
  { id: "room-1", name: "Room 1", status: "idle" },
  { id: "room-2", name: "Room 2", status: "idle" },
  { id: "room-3", name: "Room 3", status: "idle" },
  { id: "room-4", name: "Room 4", status: "idle" },
];

function resolveFacilityId(
  request: FastifyRequest,
  preferredFacilityId?: string,
): string | undefined {
  if (preferredFacilityId !== undefined && preferredFacilityId.trim() !== "") {
    return preferredFacilityId.trim();
  }
  const headerValue = request.headers["x-facility-id"];
  if (typeof headerValue === "string" && headerValue.trim() !== "") {
    return headerValue.trim();
  }
  if (request.principal !== undefined) {
    const granted = grantedFacilityIds(request.principal);
    if (granted.length > 0) return granted[0];
  }
  return undefined;
}

function extractInitials(fullNameOrDisplay?: string): string {
  if (!fullNameOrDisplay || !fullNameOrDisplay.trim()) return "P.T.";
  const cleaned = fullNameOrDisplay.trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const firstPart = parts[0];
  const lastPart = parts[parts.length - 1];

  if (parts.length >= 2 && firstPart && lastPart) {
    const firstClean = firstPart.replace(/[^a-zA-Z]/g, "");
    const lastClean = lastPart.replace(/[^a-zA-Z]/g, "");
    const firstChar = firstClean[0] ?? "P";
    const lastChar = lastClean[0] ?? "T";
    return `${firstChar.toUpperCase()}.${lastChar.toUpperCase()}.`;
  }
  if (firstPart) {
    const word = firstPart.replace(/[^a-zA-Z]/g, "");
    if (word.length >= 2) {
      const c0 = word[0] ?? "P";
      const c1 = word[1] ?? "T";
      return `${c0.toUpperCase()}.${c1.toUpperCase()}.`;
    }
    const c0 = word[0] ?? "P";
    return `${c0.toUpperCase()}.T.`;
  }
  return "P.T.";
}

function extractPractitionerInitials(display?: string, ref?: string): string {
  if (display && display.trim()) {
    const cleaned = display.replace(/^(Dr\.|Doctor)\s+/i, "").trim();
    const parts = cleaned.split(/\s+/).filter(Boolean);
    const firstPart = parts[0];
    const lastPart = parts[parts.length - 1];
    if (parts.length >= 2 && firstPart && lastPart) {
      const c0 = firstPart[0] ?? "";
      const c1 = lastPart[0] ?? "";
      return `${c0.toUpperCase()}${c1.toUpperCase()}`;
    }
    if (parts.length === 1 && firstPart && firstPart.length >= 2) {
      return firstPart.slice(0, 2).toUpperCase();
    }
  }
  if (ref && ref.startsWith("Practitioner/")) {
    const id = ref.replace("Practitioner/", "").replace(/[^a-zA-Z]/g, "");
    return id.slice(0, 2).toUpperCase();
  }
  return "";
}

function resolveCasePhase(encounter?: Encounter): CasePhase {
  if (!encounter) return "SCHEDULED";

  // Check case-stage extension
  const stageExt = encounter.extension?.find((e) =>
    e.url?.includes("case-stage") || e.url?.endsWith("/case-stage"),
  );
  const stageCode = stageExt?.valueCoding?.code ?? stageExt?.valueCode;
  if (stageCode) {
    switch (stageCode) {
      case "requested":
      case "scheduled":
        return "SCHEDULED";
      case "confirmed":
        return "CONFIRMED";
      case "arrived":
        return "ARRIVED";
      case "preop":
        return "PRE_OP";
      case "in-room":
      case "in_room":
        return "READY_FOR_PROCEDURE";
      case "procedure-start":
      case "procedure_start":
      case "procedure-end":
      case "procedure_end":
        return "IN_PROCEDURE";
      case "pacu":
        return "RECOVERY";
      case "discharged":
        return "DISCHARGED";
      case "cancelled":
        return "CANCELLED";
      case "no-show":
      case "no_show":
        return "NO_SHOW";
    }
  }

  // Check case-phase extension
  const phaseExt = encounter.extension?.find((e) =>
    e.url?.includes("case-phase") || e.url?.endsWith("/case-phase"),
  );
  const phaseCode = phaseExt?.valueCoding?.code ?? phaseExt?.valueCode;
  if (phaseCode) {
    const parsed = casePhaseFromCode(phaseCode);
    if (parsed) return parsed;
  }

  // Fallback to FHIR Encounter.status
  switch (encounter.status) {
    case "planned":
      return "SCHEDULED";
    case "arrived":
      return "ARRIVED";
    case "in-progress":
      return "IN_PROCEDURE";
    case "onleave":
      return "RECOVERY";
    case "finished":
      return "DISCHARGED";
    case "cancelled":
    case "entered-in-error":
      return "CANCELLED";
    default:
      return "SCHEDULED";
  }
}

export function whiteboardRoutes(app: FastifyInstance): Promise<void> {
  // GET /whiteboard — Today's case whiteboard with server-side TV minimization
  app.get(
    API_ROUTE_PATTERNS.whiteboard,
    { config: capabilityAtResource("schedule.read") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as { mode?: string; facilityId?: string };
      const facilityId = resolveFacilityId(request, query.facilityId);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to view the whiteboard",
        });
      }

      if (!(await app.guards.requireCapabilityAt(request, reply, "schedule.read", facilityId))) {
        return reply;
      }

      const isTvMode = query.mode === "tv";

      // 1. Compute today's date range in facility timezone
      const todayDateStr = todayIsoDate();
      const startOfDayIso = facilityDateTimeToIso(todayDateStr, "00:00");
      const endOfDayIso = facilityDateTimeToIso(todayDateStr, "23:59");
      const facilityAccountRef = `Organization/${facilityId}`;

      // 2. Query bounded date range for appointments and encounters in parallel
      const [appointments, encounters] = await Promise.all([
        request.medplum.searchResources("Appointment", [
          ["date", `ge${startOfDayIso}`],
          ["date", `le${endOfDayIso}`],
          ["_count", "100"],
        ]),
        request.medplum.searchResources("Encounter", [
          ["_count", "100"],
        ]),
      ]);

      const filteredAppointments = appointments.filter((appItem) =>
        appItem.meta?.accounts?.some((account) => account.reference === facilityAccountRef),
      );

      const encounterByApptId = new Map<string, Encounter>();
      for (const enc of encounters) {
        if (enc.appointment) {
          for (const ref of enc.appointment) {
            if (ref.reference?.startsWith("Appointment/")) {
              encounterByApptId.set(ref.reference.replace("Appointment/", ""), enc);
            }
          }
        }
      }

      // Preload patient display names to optimize initials resolution
      const patientCache = new Map<string, string>();

      const cards: WhiteboardCard[] = [];
      for (const appItem of filteredAppointments) {
        const roomRef = appItem.participant?.find((p) => p.actor?.reference?.startsWith("Location/"));
        const roomId = roomRef?.actor?.reference ? roomRef.actor.reference.replace("Location/", "") : "room-1";

        const patientParticipant = appItem.participant?.find((p) =>
          p.actor?.reference?.startsWith("Patient/"),
        );
        const patientId = patientParticipant?.actor?.reference
          ? patientParticipant.actor.reference.replace("Patient/", "")
          : undefined;

        let patientNameDisplay = patientParticipant?.actor?.display;
        if (!patientNameDisplay && patientId) {
          if (patientCache.has(patientId)) {
            patientNameDisplay = patientCache.get(patientId);
          } else {
            try {
              const patient = await request.medplum.readResource("Patient", patientId);
              const humanName = patient.name?.[0];
              if (humanName) {
                const given = humanName.given?.[0] ?? "";
                const family = humanName.family ?? "";
                patientNameDisplay = `${given} ${family}`.trim();
                patientCache.set(patientId, patientNameDisplay);
              }
            } catch {
              // Graceful fallback when patient record cannot be read
            }
          }
        }

        const initials = extractInitials(
          patientNameDisplay ?? (patientId ? `${patientId[0]} ${patientId[1] ?? ""}` : "P T"),
        );

        const docRef = appItem.participant?.find((p) => p.actor?.reference?.startsWith("Practitioner/"));
        const surgeonInitials = extractPractitionerInitials(docRef?.actor?.display, docRef?.actor?.reference);

        const linkedEncounter = appItem.id ? encounterByApptId.get(appItem.id) : undefined;
        const phase = resolveCasePhase(linkedEncounter);

        const caseId = linkedEncounter?.id ?? appItem.id ?? "case-unknown";
        const caseNumberIdentifier = linkedEncounter?.identifier?.find((id) =>
          id.system?.includes("case-number"),
        );
        const caseNumber =
          caseNumberIdentifier?.value ??
          `CASE-${(linkedEncounter?.id ?? appItem.id ?? "000000").slice(0, 6).toUpperCase()}`;

        const card: WhiteboardCard = {
          caseId,
          caseNumber,
          initials,
          phase,
          roomId,
          procedureLabel: isTvMode ? "" : (appItem.description ?? "GI Procedure"),
          scheduledStart: appItem.start ?? new Date().toISOString(),
          phaseEnteredAt: linkedEncounter?.period?.start ?? appItem.start,
          surgeonInitials: isTvMode ? "" : surgeonInitials,
          flags: isTvMode ? [] : [],
        };

        cards.push(card);
      }

      const board: WhiteboardBoard = {
        generatedAt: new Date().toISOString(),
        rooms: DEFAULT_ROOMS,
        cards,
      };

      return reply.code(200).send(board);
    },
  );

  return Promise.resolve();
}
