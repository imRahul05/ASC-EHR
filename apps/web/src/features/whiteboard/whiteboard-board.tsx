"use client";

import { useState } from "react";
import { useWhiteboard } from "@asc/api-client/react";
import { PHASE_GROUP, isPhaseAtLeast } from "@asc/clinical-rules";
import { formatTime24 } from "@asc/clinical-rules/time";
import {
  Button,
  cn,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageHeader,
  PHASE_GROUP_CLASS,
  PHASE_GROUP_ICON,
  StaleBadge,
  useNow,
} from "@asc/ui";
import { CalendarClock, CircleCheckBig, Minimize2, Tv } from "@asc/ui/icons";
import { RoomStatusStrip } from "./room-status-strip";
import { WhiteboardCard } from "./whiteboard-card";
import { UPCOMING_PHASES, WHITEBOARD_COLUMNS } from "./whiteboard-config";

const MINUTE_MS = 60_000;

/**
 * `/whiteboard` — live day board by phase column (initials + case number only, ui-guidelines §9) and
 * room status. Data refetches every 15 s via useWhiteboard; timers tick from the shared useNow clock.
 * TV mode covers the app chrome with a full-screen, large-type board for wall displays.
 */
export function WhiteboardBoard() {
  const query = useWhiteboard();
  const [tv, setTv] = useState(false);
  const now = useNow();

  if (query.isPending) return <LoadingSkeleton variant="cards" />;
  if (query.isError) {
    return <ErrorState title="Could not load the whiteboard" message="Check your connection and try again." onRetry={() => void query.refetch()} />;
  }

  const { cards, rooms, generatedAt } = query.data;
  const upcoming = cards.filter((card) => UPCOMING_PHASES.includes(card.phase)).length;
  const done = cards.filter((card) => isPhaseAtLeast(card.phase, "DISCHARGED")).length;
  const elapsed = (enteredAt: string | undefined) => (enteredAt ? Math.max(0, Math.floor((now - Date.parse(enteredAt)) / MINUTE_MS)) : null);

  return (
    <div
      className={cn("space-y-5", tv && "fixed inset-0 z-50 overflow-y-auto bg-background p-6")}
      data-testid="whiteboard"
      data-tv={tv}
    >
      <PageHeader
        title="Whiteboard"
        description={tv ? undefined : "Today's cases by phase. Initials and case number only — safe for shared displays."}
        className={cn(tv && "[&_h1]:text-4xl")}
        actions={
          <>
            <span className={cn("inline-flex items-center gap-1.5 text-muted-foreground tabular-nums", tv ? "text-base" : "text-xs")} aria-live="polite">
              {query.isRefetchError ? (
                <StaleBadge stale />
              ) : (
                <span aria-hidden className="size-2 rounded-full bg-success motion-safe:animate-pulse" />
              )}
              Updated {formatTime24(generatedAt)}
            </span>
            <Button
              variant={tv ? "default" : "outline"}
              className="min-h-11"
              onClick={() => setTv((value) => !value)}
              aria-pressed={tv}
              data-testid="whiteboard-tv-toggle"
            >
              {tv ? <Minimize2 aria-hidden /> : <Tv aria-hidden />}
              {tv ? "Exit TV mode" : "TV mode"}
            </Button>
          </>
        }
      />

      <RoomStatusStrip rooms={rooms} cards={cards} tv={tv} />

      <div className={cn("flex flex-wrap gap-4 text-muted-foreground", tv ? "text-base" : "text-xs")}>
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock aria-hidden className="size-3.5" /> {upcoming} upcoming today
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CircleCheckBig aria-hidden className="size-3.5" /> {done} discharged
        </span>
      </div>

      {cards.length === 0 ? (
        <EmptyState
          title="No cases today"
          description="Book a case from the schedule; it appears here once the patient arrives."
          icon={CalendarClock}
        />
      ) : (
        <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", tv ? "xl:grid-cols-6" : "2xl:grid-cols-6")}>
          {WHITEBOARD_COLUMNS.map((column) => {
            const group = PHASE_GROUP[column.phase];
            const Icon = PHASE_GROUP_ICON[group];
            const columnCards = cards.filter((card) => card.phase === column.phase);
            return (
              <section
                key={column.id}
                aria-labelledby={`wb-col-${column.id}`}
                className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-muted/40 p-2"
                data-testid={`whiteboard-column-${column.id}`}
              >
                <header className={cn("flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5", PHASE_GROUP_CLASS[group])}>
                  <h2 id={`wb-col-${column.id}`} className={cn("flex items-center gap-1.5 font-semibold", tv ? "text-lg" : "text-sm")}>
                    <Icon aria-hidden className="size-4" />
                    {column.title}
                  </h2>
                  <span className={cn("font-medium tabular-nums", tv ? "text-lg" : "text-xs")} aria-label={`${columnCards.length} cases`}>
                    {columnCards.length}
                  </span>
                </header>
                {columnCards.length === 0 ? (
                  <p className={cn("px-2 py-4 text-center text-muted-foreground", tv ? "text-base" : "text-xs")}>No cases</p>
                ) : (
                  columnCards.map((card) => (
                    <WhiteboardCard
                      key={card.caseId}
                      card={card}
                      elapsedMin={elapsed(card.phaseEnteredAt)}
                      warnAfterMin={column.warnAfterMin}
                      tv={tv}
                    />
                  ))
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
