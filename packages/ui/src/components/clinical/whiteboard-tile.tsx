import type { Room, RoomStatus } from "@asc/types";
import { Activity, Ban, CircleDashed, Clock, DoorOpen, RefreshCw, Stethoscope } from "lucide-react";
import { cn } from "../../lib/utils";

export type WhiteboardStage =
  | "scheduled"
  | "preop"
  | "in_progress"
  | "pacu"
  | "discharged";

export interface WhiteboardTileCase {
  readonly caseId: string;
  readonly caseNumber: string;
  /** Patient initials ONLY (e.g. "J.D.") — P15 Q1 policy strictly bans full name, DOB, SSN, indications. */
  readonly initials: string;
  readonly stage: WhiteboardStage;
  readonly elapsedMin?: number | null;
  readonly scheduledStart?: string;
  readonly physicianInitials?: string;
}

export interface WhiteboardTileProps {
  readonly room: Room;
  readonly currentCase?: WhiteboardTileCase | null;
  readonly tv?: boolean;
  readonly className?: string;
}

export const STAGE_BADGE_META: Readonly<
  Record<
    WhiteboardStage,
    { readonly label: string; readonly badgeClass: string }
  >
> = {
  scheduled: {
    label: "Scheduled",
    badgeClass: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800/80 dark:text-slate-200 dark:border-slate-700",
  },
  preop: {
    label: "Pre-Op",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800",
  },
  in_progress: {
    label: "In Progress",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-300 motion-safe:animate-pulse dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800",
  },
  pacu: {
    label: "PACU",
    badgeClass: "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/60 dark:text-teal-200 dark:border-teal-800",
  },
  discharged: {
    label: "Discharged",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800",
  },
};

export const ROOM_STATUS_META: Readonly<
  Record<
    RoomStatus,
    { readonly label: string; readonly tone: string }
  >
> = {
  in_use: { label: "Occupied", tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  turnover: { label: "Turnover", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  idle: { label: "Available", tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  blocked: { label: "Blocked", tone: "bg-destructive/10 text-destructive" },
};

export function toWhiteboardStage(stageOrPhase: string): WhiteboardStage {
  const normalized = stageOrPhase.toLowerCase().replace(/-/g, "_");
  if (normalized === "scheduled" || normalized === "confirmed" || normalized === "arrived") {
    return "scheduled";
  }
  if (normalized === "preop" || normalized === "pre_op" || normalized === "ready_for_procedure") {
    return "preop";
  }
  if (
    normalized === "in_procedure" ||
    normalized === "in_room" ||
    normalized === "procedure_start" ||
    normalized === "procedure_end" ||
    normalized === "in_progress"
  ) {
    return "in_progress";
  }
  if (normalized === "recovery" || normalized === "pacu" || normalized === "ready_for_discharge") {
    return "pacu";
  }
  if (
    normalized === "discharged" ||
    normalized === "chart_complete" ||
    normalized === "coded" ||
    normalized === "closed"
  ) {
    return "discharged";
  }
  return "scheduled";
}

/**
 * Public Whiteboard TV Tile for ASC operating rooms.
 * CRITICAL PHI INVARIANT: Renders Patient Initials + Case Number ONLY (e.g. "J.D. · CASE-1042").
 * Zero full names, dates of birth, SSNs, or clinical indications are ever rendered in the DOM.
 */
export function WhiteboardTile({ room, currentCase, tv = false, className }: WhiteboardTileProps) {
  const roomMeta = ROOM_STATUS_META[room.status];
  const stageMeta = currentCase ? STAGE_BADGE_META[currentCase.stage] : null;

  return (
    <article
      className={cn(
        "flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-xs transition-shadow",
        currentCase?.stage === "in_progress" && "ring-1 ring-blue-500/30",
        tv && "p-6 min-h-[16rem]",
        className,
      )}
      data-testid={`whiteboard-tile-${room.id}`}
      data-room-id={room.id}
      data-status={room.status}
    >
      {/* Tile Header: Room name & status */}
      <header className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <DoorOpen aria-hidden className={cn("text-muted-foreground", tv ? "size-6" : "size-4")} />
          <h3 className={cn("font-bold tracking-tight text-foreground", tv ? "text-2xl" : "text-base")}>
            {room.name}
          </h3>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium tabular-nums",
            roomMeta.tone,
            tv ? "text-sm px-3 py-1" : "text-xs",
          )}
        >
          {room.status === "in_use" && <Activity aria-hidden className="size-3 motion-safe:animate-pulse" />}
          {room.status === "turnover" && <RefreshCw aria-hidden className="size-3" />}
          {room.status === "idle" && <CircleDashed aria-hidden className="size-3" />}
          {room.status === "blocked" && <Ban aria-hidden className="size-3" />}
          {roomMeta.label}
        </span>
      </header>

      {/* Tile Body: Patient Initials + Case Number + Stage Badge */}
      <div className={cn("my-3 flex-1 space-y-3", tv && "my-4 space-y-4")}>
        {currentCase ? (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              {/* Public PHI Compliance: Initials + Case Number ONLY */}
              <div
                className={cn("font-bold tracking-tight text-foreground", tv ? "text-3xl" : "text-xl")}
                data-testid="whiteboard-patient-display"
              >
                {currentCase.initials} · <span className="font-mono text-muted-foreground">{currentCase.caseNumber}</span>
              </div>
            </div>

            {/* Stage Badge matching @asc/fhir stage contracts */}
            {stageMeta && (
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold uppercase tracking-wider",
                    stageMeta.badgeClass,
                    tv ? "text-sm px-3 py-1" : "text-xs",
                  )}
                  data-testid="whiteboard-stage-badge"
                  data-stage={currentCase.stage}
                >
                  {stageMeta.label}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center py-6 text-center">
            <p className={cn("text-muted-foreground", tv ? "text-lg" : "text-sm")}>
              No case currently in room
            </p>
          </div>
        )}
      </div>

      {/* Tile Footer: Provider & Duration */}
      {currentCase && (
        <footer className={cn("flex items-center justify-between border-t border-border/60 pt-3 text-muted-foreground", tv ? "text-base pt-4" : "text-xs")}>
          <div className="flex items-center gap-1.5">
            {currentCase.physicianInitials && (
              <>
                <Stethoscope aria-hidden className="size-3.5" />
                <span className="font-medium">Dr. {currentCase.physicianInitials}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 tabular-nums">
            <Clock aria-hidden className="size-3.5" />
            <span>
              {currentCase.elapsedMin != null
                ? `${currentCase.elapsedMin}m in room`
                : currentCase.scheduledStart
                  ? `Sched ${currentCase.scheduledStart}`
                  : "In procedure"}
            </span>
          </div>
        </footer>
      )}
    </article>
  );
}
