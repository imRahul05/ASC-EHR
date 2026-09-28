import Link from "next/link";
import { formatDuration, formatTime24 } from "@asc/clinical-rules/time";
import type { WhiteboardCard as WhiteboardCardData } from "@asc/types";
import { cn } from "@asc/ui";
import { Clock, DoorOpen, Stethoscope, TriangleAlert } from "@asc/ui/icons";
import { FLAG_META, roomLabel } from "./whiteboard-config";

interface WhiteboardCardProps {
  readonly card: WhiteboardCardData;
  readonly elapsedMin: number | null;
  readonly warnAfterMin: number;
  readonly tv: boolean;
}

/** One case on the board. Public display rule: initials + case number only (no name, DOB, MRN). */
export function WhiteboardCard({ card, elapsedMin, warnAfterMin, tv }: WhiteboardCardProps) {
  const overdue = elapsedMin !== null && elapsedMin > warnAfterMin;
  return (
    <Link
      href={`/cases/${card.caseId}`}
      aria-label={`Open case ${card.caseNumber}, initials ${card.initials.split("").join(" ")}`}
      data-testid={`whiteboard-card-${card.caseId}`}
      className={cn(
        "block min-h-11 rounded-lg border border-border bg-card p-3 shadow-xs outline-none transition-colors hover:border-primary/40 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50",
        overdue && "border-warning/50",
        tv && "p-4",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn("font-semibold tracking-tight text-foreground", tv ? "text-3xl" : "text-xl")}>{card.initials}</span>
        <span className={cn("font-mono text-muted-foreground tabular-nums", tv ? "text-base" : "text-xs")}>{card.caseNumber}</span>
      </div>

      <dl className={cn("mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-muted-foreground", tv ? "text-base" : "text-xs")}>
        <div className="flex items-center gap-1">
          <dt className="sr-only">Room</dt>
          <DoorOpen aria-hidden className="size-3.5 shrink-0" />
          <dd>{roomLabel(card.roomId)}</dd>
        </div>
        <div className="flex items-center gap-1">
          <dt className="sr-only">Surgeon</dt>
          <Stethoscope aria-hidden className="size-3.5 shrink-0" />
          <dd>{card.surgeonInitials}</dd>
        </div>
        <div className={cn("col-span-2 flex items-center gap-1 tabular-nums", overdue && "font-medium text-warning")}>
          <dt className="sr-only">Time in phase</dt>
          {overdue ? <TriangleAlert aria-hidden className="size-3.5 shrink-0" /> : <Clock aria-hidden className="size-3.5 shrink-0" />}
          <dd>
            {elapsedMin === null ? `Sched ${formatTime24(card.scheduledStart)}` : `${formatDuration(elapsedMin)} in phase`}
            {overdue && <span className="sr-only"> (longer than usual)</span>}
          </dd>
        </div>
      </dl>

      {card.flags.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1" aria-label="Flags">
          {card.flags.map((flag) => {
            const { label, icon: Icon, tone } = FLAG_META[flag];
            return (
              <li
                key={flag}
                className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium", tone, tv ? "text-sm" : "text-[11px]")}
                data-testid={`whiteboard-flag-${flag}`}
              >
                <Icon aria-hidden className="size-3" />
                {label}
              </li>
            );
          })}
        </ul>
      )}
    </Link>
  );
}
