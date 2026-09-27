import type { BookCasePayload, ConflictCheckResult, ProcedureCase, ScheduleConflict } from "@asc/types";
import { STOPPED_PHASES } from "./phases";

const MINUTE_MS = 60_000;

type Proposed = Pick<
  BookCasePayload,
  "patientId" | "roomId" | "scheduledStart" | "durationMin" | "surgeonId" | "anesthesiaId" | "nurseId"
>;

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

interface ConflictProbe {
  readonly kind: ScheduleConflict["kind"];
  readonly clashes: (existing: ProcedureCase, proposed: Proposed) => boolean;
  readonly label: string;
}

const PROBES: readonly ConflictProbe[] = [
  { kind: "room", label: "Room", clashes: (c, p) => c.roomId === p.roomId },
  { kind: "surgeon", label: "Surgeon", clashes: (c, p) => c.team.surgeon.id === p.surgeonId },
  { kind: "anesthesia", label: "Anesthesia provider", clashes: (c, p) => c.team.anesthesia.id === p.anesthesiaId },
  { kind: "nurse", label: "Nurse", clashes: (c, p) => c.team.nurse.id === p.nurseId },
  { kind: "patient", label: "Patient", clashes: (c, p) => c.patientId === p.patientId },
];

/** Overlap check of a proposed booking against existing cases (cancelled / no-show ignored). */
export function findScheduleConflicts(
  existing: readonly ProcedureCase[],
  proposed: Proposed,
  ignoreCaseId?: string,
): ConflictCheckResult {
  const start = Date.parse(proposed.scheduledStart);
  const end = start + proposed.durationMin * MINUTE_MS;
  const conflicts: ScheduleConflict[] = existing
    .filter((item) => item.id !== ignoreCaseId && !STOPPED_PHASES.includes(item.phase))
    .filter((item) => {
      const itemStart = Date.parse(item.scheduledStart);
      return overlaps(start, end, itemStart, itemStart + item.durationMin * MINUTE_MS);
    })
    .flatMap((item) =>
      PROBES.filter((probe) => probe.clashes(item, proposed)).map((probe) => ({
        kind: probe.kind,
        caseId: item.id,
        message: `${probe.label} already booked on case ${item.caseNumber} at that time.`,
      })),
    );
  return {
    ok: conflicts.length === 0,
    reasons: conflicts.map((conflict) => ({ code: `CONFLICT_${conflict.kind.toUpperCase()}`, message: conflict.message })),
    conflicts,
  };
}
