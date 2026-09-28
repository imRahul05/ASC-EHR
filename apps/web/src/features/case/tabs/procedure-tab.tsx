"use client";

import { useCase } from "@asc/api-client/react";
import { formatTime24, isPhaseAtLeast, PHASE_LABEL, STOPPED_PHASES, TIME_OUT_ROLE_LABEL } from "@asc/clinical-rules";
import type { CasePhase } from "@asc/types";
import { EmptyState, ErrorState, LoadingSkeleton } from "@asc/ui";
import { BadgeCheck, DoorClosed } from "@asc/ui/icons";
import { BbpsEntry } from "../procedure/bbps-entry";
import { EventTapBar } from "../procedure/event-tap-bar";
import { ImageCaptureGrid } from "../procedure/image-capture-grid";
import { NarrationPanel } from "../procedure/narration-panel";
import { RoomStatusBar } from "../procedure/room-status-bar";
import { SpecimenPanel } from "../procedure/specimen-panel";
import { TimeOutPanel } from "../procedure/time-out-panel";

interface ProcedureTabProps {
  readonly caseId: string;
}

/** Phases after which the prep score can still be corrected (until the note is signed). */
const BBPS_EDITABLE: readonly CasePhase[] = ["IN_PROCEDURE", "RECOVERY", "READY_FOR_DISCHARGE", "DISCHARGED"];

/**
 * Procedure room (room mode: ≥ 48 px targets, large type, high contrast). READY_FOR_PROCEDURE shows the
 * multi-role time-out; IN_PROCEDURE the event taps, timers, narration, specimens and images; later phases
 * show the same record read-only.
 */
export function ProcedureTab({ caseId }: ProcedureTabProps) {
  const query = useCase(caseId);

  if (query.isPending) return <LoadingSkeleton variant="detail" />;
  if (query.isError) {
    return <ErrorState title="Could not load the procedure" message="Check your connection and try again." onRetry={() => void query.refetch()} />;
  }

  const detail = query.data;
  const { phase } = detail.case;
  const inRoom = phase === "IN_PROCEDURE";
  const isColon = detail.case.procedure !== "EGD";

  if (STOPPED_PHASES.includes(phase) || !isPhaseAtLeast(phase, "READY_FOR_PROCEDURE")) {
    return (
      <div data-testid="case-tab-procedure">
        <EmptyState
          icon={DoorClosed}
          title="Procedure room not open yet"
          description={`The case is ${PHASE_LABEL[phase].toLowerCase()}. Finish the pre-op readiness gate to open the room.`}
        />
      </div>
    );
  }

  const { timeOut } = detail;

  return (
    <div className="@container space-y-4 text-base" data-testid="case-tab-procedure" data-room-mode>
      <RoomStatusBar detail={detail} />

      {phase === "READY_FOR_PROCEDURE" ? (
        <TimeOutPanel detail={detail} />
      ) : (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-success/30 bg-success/8 px-4 py-3 text-sm" data-testid="procedure-timeout-summary">
          <BadgeCheck aria-hidden className="size-5 text-success" />
          <span className="font-semibold text-success">Time-out complete{timeOut.completedAt ? ` ${formatTime24(timeOut.completedAt)}` : ""}</span>
          <span className="text-muted-foreground">
            {timeOut.attestations.map((item) => `${TIME_OUT_ROLE_LABEL[item.role]} ${item.by.initials}`).join(" · ")}
          </span>
        </p>
      )}

      {phase !== "READY_FOR_PROCEDURE" && (
        <>
          <EventTapBar detail={detail} editable={inRoom} />
          <div className="grid gap-4 @5xl:grid-cols-2">
            <NarrationPanel detail={detail} editable={inRoom} />
            <SpecimenPanel detail={detail} editable={inRoom} />
          </div>
          <div className={isColon ? "grid gap-4 @5xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : undefined}>
            <ImageCaptureGrid detail={detail} editable={inRoom} />
            {isColon && <BbpsEntry key={JSON.stringify(detail.case.bbps ?? null)} detail={detail} editable={BBPS_EDITABLE.includes(phase)} />}
          </div>
        </>
      )}
    </div>
  );
}
