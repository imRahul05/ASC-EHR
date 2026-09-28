import type { CasePhase, RoomStatus, WhiteboardCard } from "@asc/types";
import {
  Activity,
  Ban,
  CircleDashed,
  RefreshCw,
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

export const ROOM_STATUS_META: Readonly<Record<RoomStatus, { readonly label: string; readonly icon: LucideIcon; readonly tone: string }>> = {
  in_use: { label: "Occupied", icon: Activity, tone: "bg-phase-procedure text-phase-procedure-foreground" },
  turnover: { label: "Turnover", icon: RefreshCw, tone: "bg-warning/10 text-warning" },
  idle: { label: "Idle", icon: CircleDashed, tone: "bg-muted text-muted-foreground" },
  blocked: { label: "Blocked", icon: Ban, tone: "bg-destructive/10 text-destructive" },
};

/** `room-2` → `Room 2` (fallback when the room list has no name). */
export function roomLabel(roomId: string): string {
  return roomId.replace("room-", "Room ");
}
