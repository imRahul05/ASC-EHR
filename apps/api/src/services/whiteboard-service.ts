import { isRoomOccupyingPhase } from "@asc/clinical-rules/phases";
import { facilityDateTimeToIso, todayIsoDate } from "@asc/clinical-rules/time";
import { casePhaseFromCode } from "@asc/fhir/case-phase";
import type { CasePhase, Room, WhiteboardBoard, WhiteboardCard } from "@asc/types";
import type { MedplumClient } from "@medplum/core";
import type { Encounter } from "@medplum/fhirtypes";
import type { FastifyBaseLogger } from "fastify";

export const DEFAULT_ROOMS: readonly Room[] = [
  { id: "room-1", name: "Room 1", status: "idle" },
  { id: "room-2", name: "Room 2", status: "idle" },
  { id: "room-3", name: "Room 3", status: "idle" },
  { id: "room-4", name: "Room 4", status: "idle" },
];

export const TURNOVER_WINDOW_MS = 15 * 60_000;

export function computeRoomStatuses(cards: readonly WhiteboardCard[]): Room[] {
  const now = Date.now();
  return DEFAULT_ROOMS.map((room) => {
    // 1. Check for active case currently occupying the procedure suite
    const activeCard = cards.find(
      (c) => c.roomId === room.id && isRoomOccupyingPhase(c.phase),
    );
    if (activeCard) {
      return {
        id: room.id,
        name: room.name,
        status: "in_use",
        currentCaseId: activeCard.caseId,
      };
    }

    // 2. Check for recent exit from procedure room into recovery/discharge within 15-minute turnover window
    const turnoverCard = cards.find((c) => {
      if (c.roomId !== room.id) return false;
      const normalizedPhase = c.phase.toLowerCase();
      const isPostRoomPhase =
        normalizedPhase === "recovery" ||
        normalizedPhase === "pacu" ||
        normalizedPhase === "ready_for_discharge" ||
        normalizedPhase === "discharged";
      if (!isPostRoomPhase) return false;
      if (!c.phaseEnteredAt) return false;
      const enteredTime = Date.parse(c.phaseEnteredAt);
      if (Number.isNaN(enteredTime)) return false;
      const elapsed = now - enteredTime;
      return elapsed >= 0 && elapsed < TURNOVER_WINDOW_MS;
    });

    if (turnoverCard) {
      return {
        id: room.id,
        name: room.name,
        status: "turnover",
        currentCaseId: turnoverCard.caseId,
      };
    }

    return {
      id: room.id,
      name: room.name,
      status: "idle",
      currentCaseId: undefined,
    };
  });
}

export function extractInitials(fullNameOrDisplay?: string): string {
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

export function extractPractitionerInitials(display?: string, ref?: string): string {
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

export function extractCardFlags(
  encounter?: Encounter,
): readonly ("allergy" | "anticoagulant" | "escort_missing" | "eligibility")[] {
  if (!encounter) return [];
  const flags: ("allergy" | "anticoagulant" | "escort_missing" | "eligibility")[] = [];
  const flagExts = encounter.extension?.filter(
    (e) => e.url?.includes("case-flag") || e.url?.endsWith("/flag"),
  );
  if (flagExts) {
    for (const ext of flagExts) {
      const code = ext.valueCode ?? ext.valueCoding?.code;
      if (
        code === "allergy" ||
        code === "anticoagulant" ||
        code === "escort_missing" ||
        code === "eligibility"
      ) {
        if (!flags.includes(code)) flags.push(code);
      }
    }
  }
  return flags;
}

export function formatCanonicalCaseNumber(rawNumber?: string, fallbackId?: string): string {
  if (rawNumber && rawNumber.trim()) {
    const trimmed = rawNumber.trim();
    return trimmed.startsWith("CASE-") ? trimmed : `CASE-${trimmed}`;
  }
  const cleanId = (fallbackId ?? "000000").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return `CASE-${cleanId.slice(0, 6)}`;
}

export function resolveCasePhase(encounter?: Encounter): CasePhase {
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

interface GetWhiteboardParams {
  readonly medplum: MedplumClient;
  readonly facilityId: string;
  readonly isTvMode?: boolean;
  readonly logger?: FastifyBaseLogger;
}


export async function getWhiteboard(params: GetWhiteboardParams): Promise<WhiteboardBoard> {
  const { medplum, facilityId, isTvMode = false } = params;

  // 1. Compute today's date range in facility timezone
  const todayDateStr = todayIsoDate();
  const startOfDayIso = facilityDateTimeToIso(todayDateStr, "00:00");
  const endOfDayIso = facilityDateTimeToIso(todayDateStr, "23:59");
  const facilityAccountRef = `Organization/${facilityId}`;

  // 2. Query bounded date range for appointments and encounters in parallel
  const [appointments, encounters] = await Promise.all([
    medplum.searchResources("Appointment", [
      ["date", `ge${startOfDayIso}`],
      ["date", `le${endOfDayIso}`],
      ["_count", "100"],
    ]),
    medplum.searchResources("Encounter", [
      ["date", `ge${startOfDayIso}`],
      ["date", `le${endOfDayIso}`],
      ["_count", "100"],
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

  // Batch load missing patient display names in a single query to eliminate N+1 queries
  const missingPatientIds = new Set<string>();
  for (const appItem of filteredAppointments) {
    const patientParticipant = appItem.participant?.find((p) =>
      p.actor?.reference?.startsWith("Patient/"),
    );
    const patientId = patientParticipant?.actor?.reference
      ? patientParticipant.actor.reference.replace("Patient/", "")
      : undefined;
    if (!patientParticipant?.actor?.display && patientId) {
      missingPatientIds.add(patientId);
    }
  }

  const patientDisplayById = new Map<string, string>();
  if (missingPatientIds.size > 0) {
    try {
      const patientIdList = Array.from(missingPatientIds);
      const patients = await medplum.searchResources("Patient", [
        ["_id", patientIdList.join(",")],
        ["_count", String(patientIdList.length)],
      ]);
      for (const patient of patients) {
        if (patient.id) {
          const humanName = patient.name?.[0];
          if (humanName) {
            const given = humanName.given?.[0] ?? "";
            const family = humanName.family ?? "";
            const fullName = `${given} ${family}`.trim();
            if (fullName) {
              patientDisplayById.set(patient.id, fullName);
            }
          }
        }
      }
    } catch {
      // Graceful fallback when batch search fails
    }
  }

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

    const patientNameDisplay =
      patientParticipant?.actor?.display ??
      (patientId ? patientDisplayById.get(patientId) : undefined);

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
    const caseNumber = formatCanonicalCaseNumber(
      caseNumberIdentifier?.value,
      linkedEncounter?.id ?? appItem.id,
    );

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
      flags: isTvMode ? [] : extractCardFlags(linkedEncounter),
    };

    cards.push(card);
  }

  const rooms = computeRoomStatuses(cards);

  return {
    generatedAt: new Date().toISOString(),
    rooms,
    cards,
  };
}
