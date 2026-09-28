"use client";

import { useAddProcedureEvent } from "@asc/api-client/react";
import { formatTime24, PROCEDURE_EVENT_LABEL, REPEATABLE_PROCEDURE_EVENTS } from "@asc/clinical-rules";
import type { CaseDetail, ProcedureEventType } from "@asc/types";
import { SectionCard, TapTile, toast } from "@asc/ui";
import {
  CircleDot,
  CircleStop,
  LogIn,
  LogOut,
  MapPin,
  Syringe,
  Target,
  TriangleAlert,
  Undo2,
  type LucideIcon,
} from "@asc/ui/icons";
import { notifyError } from "../notify-error";

interface EventTapBarProps {
  readonly detail: CaseDetail;
  readonly editable: boolean;
}

interface EventTile {
  readonly type: ProcedureEventType;
  readonly icon: LucideIcon;
  /** Colon-only landmark (hidden for EGD). */
  readonly colonOnly?: boolean;
}

/** Tap order follows the procedure. */
const EVENT_TILES: readonly EventTile[] = [
  { type: "SEDATION_START", icon: Syringe },
  { type: "SCOPE_IN", icon: LogIn },
  { type: "CECUM_REACHED", icon: Target, colonOnly: true },
  { type: "TERMINAL_ILEUM", icon: MapPin, colonOnly: true },
  { type: "WITHDRAWAL_START", icon: Undo2, colonOnly: true },
  { type: "POLYP_FOUND", icon: CircleDot },
  { type: "SCOPE_OUT", icon: LogOut },
  { type: "SEDATION_END", icon: CircleStop },
  { type: "COMPLICATION", icon: TriangleAlert },
];

/** Room-mode event taps: one tap records the event at "now" (24 h time shown on the tile). */
export function EventTapBar({ detail, editable }: EventTapBarProps) {
  const addEvent = useAddProcedureEvent(detail.case.id);
  const isColon = detail.case.procedure !== "EGD";
  const tiles = EVENT_TILES.filter((tile) => isColon || !tile.colonOnly);
  const pendingType = addEvent.isPending ? addEvent.variables.type : null;

  const record = (type: ProcedureEventType) =>
    addEvent.mutate(
      { type },
      {
        onSuccess: () => toast.success(`${PROCEDURE_EVENT_LABEL[type]} recorded`),
        onError: notifyError("Could not record the event"),
      },
    );

  return (
    <SectionCard title="Events" description="Tap when it happens — times drive withdrawal time and the note." data-testid="procedure-events">
      <div className="grid grid-cols-2 gap-2 @md:grid-cols-3 @5xl:grid-cols-5">
        {tiles.map(({ type, icon }) => {
          const recorded = detail.events.filter((event) => event.type === type);
          const repeatable = REPEATABLE_PROCEDURE_EVENTS.includes(type);
          const last = recorded.at(-1);
          const done = !repeatable && recorded.length > 0;
          const detailText =
            pendingType === type
              ? "Recording…"
              : repeatable && recorded.length > 0
                ? `${recorded.length}× · last ${last ? formatTime24(last.at) : ""}`
                : last
                  ? formatTime24(last.at)
                  : "Tap to record";
          return (
            <TapTile
              key={type}
              label={PROCEDURE_EVENT_LABEL[type]}
              detail={detailText}
              icon={icon}
              done={done}
              disabled={!editable || done || addEvent.isPending}
              onClick={() => record(type)}
              data-testid={`procedure-event-${type.toLowerCase()}`}
            />
          );
        })}
      </div>
    </SectionCard>
  );
}
