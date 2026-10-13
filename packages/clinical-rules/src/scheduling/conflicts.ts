import type { RuleReason, RuleResult } from "@asc/types";

export interface ScheduleSlot {
  readonly id?: string;
  readonly roomId: string;
  readonly startMs: number;
  readonly durationMinutes: number;
  readonly endMs?: number;
  readonly primaryPhysicianId: string;
  readonly anesthesiologistId?: string;
  readonly status?: string;
}

export const ROOM_DOUBLE_BOOKED_CODE = "ROOM_DOUBLE_BOOKED";
export const ROOM_DOUBLE_BOOKED_MESSAGE = "Operating room is already occupied during this time window";

export const PHYSICIAN_DOUBLE_BOOKED_CODE = "PHYSICIAN_DOUBLE_BOOKED";
export const PHYSICIAN_DOUBLE_BOOKED_MESSAGE = "Physician has another procedure scheduled during this time window";

export const ANESTHESIA_DOUBLE_BOOKED_CODE = "ANESTHESIA_DOUBLE_BOOKED";
export const ANESTHESIA_DOUBLE_BOOKED_MESSAGE = "Anesthesia provider is booked in another room during this time window";

function isCancelledOrNoShow(status?: string): boolean {
  if (status === undefined) return false;
  const normalized = status.trim().toLowerCase();
  return (
    normalized === "cancelled" ||
    normalized === "no_show" ||
    normalized === "no-show" ||
    normalized === "noshow" ||
    normalized === "entered-in-error"
  );
}

/**
 * Pure scheduling conflict detection engine with zero database dependencies.
 * Evaluates candidate case against existing cases to detect room, physician, or
 * anesthesia overlaps.
 */
export function evaluateScheduleConflict(
  candidateCase: ScheduleSlot,
  existingCases: readonly ScheduleSlot[],
): RuleResult {
  const candidateEndMs =
    candidateCase.endMs !== undefined && candidateCase.endMs > candidateCase.startMs
      ? candidateCase.endMs
      : candidateCase.startMs + candidateCase.durationMinutes * 60 * 1000;

  const reasons: RuleReason[] = [];
  const seenCodes = new Set<string>();

  function recordConflict(code: string, message: string): void {
    if (!seenCodes.has(code)) {
      seenCodes.add(code);
      reasons.push({ code, message });
    }
  }

  for (const existing of existingCases) {
    if (candidateCase.id !== undefined && existing.id === candidateCase.id) {
      continue;
    }

    if (isCancelledOrNoShow(existing.status)) {
      continue;
    }

    const existingEndMs =
      existing.endMs !== undefined && existing.endMs > existing.startMs
        ? existing.endMs
        : existing.startMs + existing.durationMinutes * 60 * 1000;

    const overlaps =
      candidateCase.startMs < existingEndMs && candidateEndMs > existing.startMs;

    if (!overlaps) {
      continue;
    }

    // Room conflict
    if (candidateCase.roomId === existing.roomId) {
      recordConflict(ROOM_DOUBLE_BOOKED_CODE, ROOM_DOUBLE_BOOKED_MESSAGE);
    }

    // Physician conflict
    if (candidateCase.primaryPhysicianId === existing.primaryPhysicianId) {
      recordConflict(PHYSICIAN_DOUBLE_BOOKED_CODE, PHYSICIAN_DOUBLE_BOOKED_MESSAGE);
    }

    // Anesthesia conflict
    if (
      candidateCase.anesthesiologistId !== undefined &&
      existing.anesthesiologistId !== undefined &&
      candidateCase.anesthesiologistId === existing.anesthesiologistId
    ) {
      recordConflict(ANESTHESIA_DOUBLE_BOOKED_CODE, ANESTHESIA_DOUBLE_BOOKED_MESSAGE);
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}
