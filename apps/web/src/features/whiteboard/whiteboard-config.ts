import type { CasePhase, WhiteboardCard } from "@asc/types";
import {
  ShieldAlert,
  TriangleAlert,
  UserX,
  Pill,
  type LucideIcon,
} from "@asc/ui/icons";

/**
 * Whiteboard columns (day-of phases, docs/product/07 §4). `warnAfterMin` highlights a card that has
 * waited longer than the usual time in that phase (icon + text, not colour alone). `showScheduled` columns
 * show the booked start instead of time in phase (patients not here yet, so check-in starts from the board).
 */
export const WHITEBOARD_COLUMNS: readonly {
  readonly id: string;
  readonly title: string;
  readonly phase: CasePhase;
  readonly warnAfterMin: number;
  readonly showScheduled?: boolean;
}[] = [
  { id: "expected", title: "Expected", phase: "CONFIRMED", warnAfterMin: 0, showScheduled: true },
  { id: "arrived", title: "Arrived", phase: "ARRIVED", warnAfterMin: 20 },
  { id: "pre-op", title: "Pre-op", phase: "PRE_OP", warnAfterMin: 45 },
  { id: "ready", title: "Ready", phase: "READY_FOR_PROCEDURE", warnAfterMin: 30 },
  { id: "in-procedure", title: "In procedure", phase: "IN_PROCEDURE", warnAfterMin: 60 },
  { id: "recovery", title: "Recovery", phase: "RECOVERY", warnAfterMin: 60 },
  { id: "discharge", title: "Ready for discharge", phase: "READY_FOR_DISCHARGE", warnAfterMin: 30 },
];

/** Booked but not yet confirmed — counted in the summary line, not shown as a column. */
export const UPCOMING_PHASES: readonly CasePhase[] = ["SCHEDULED"];

type Flag = WhiteboardCard["flags"][number];

/** Flag → icon + short text (colour is never the only signal). `tone` is a token text class. */
export const FLAG_META: Readonly<Record<Flag, { readonly label: string; readonly icon: LucideIcon; readonly tone: string }>> = {
  allergy: { label: "Allergy", icon: TriangleAlert, tone: "text-destructive bg-destructive/10" },
  anticoagulant: { label: "Med hold", icon: Pill, tone: "text-warning bg-warning/10" },
  escort_missing: { label: "No escort", icon: UserX, tone: "text-warning bg-warning/10" },
  eligibility: { label: "Eligibility", icon: ShieldAlert, tone: "text-info bg-info/10" },
};

export { ROOM_STATUS_META } from "@asc/ui";

/** `room-2` → `Room 2` (fallback when the room list has no name). */
export function roomLabel(roomId: string): string {
  return roomId.replace("room-", "Room ");
}
