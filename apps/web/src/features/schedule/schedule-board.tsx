"use client";

import { Suspense, useState, type ComponentProps } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSchedule } from "@asc/api-client/react";
import { PHASE_GROUP, PHASE_GROUP_LABEL, PHASE_GROUP_ORDER } from "@asc/clinical-rules";
import { formatTime24, formatWeekday, toIsoDate, todayIsoDate } from "@asc/clinical-rules/time";
import type { ProcedureCase, Room, RoomStatus } from "@asc/types";
import {
  Button,
  ErrorState,
  LoadingSkeleton,
  OfflineBanner,
  PageHeader,
  PHASE_GROUP_DOT,
  RoomTimeGrid,
  StaleBadge,
  useNow,
  type RoomTimeGridItem,
} from "@asc/ui";
import { CalendarPlus, ChevronLeft, ChevronRight } from "@asc/ui/icons";
import { BookCaseSheet } from "./book-case-sheet";
import { CLINIC_END_HOUR, CLINIC_START_HOUR } from "./schedule-options";

type BookCaseDefaults = ComponentProps<typeof BookCaseSheet>["defaults"];

const DAY_MS = 86_400_000;
const ROOM_STATUS_LABEL: Readonly<Record<RoomStatus, string>> = {
  idle: "Available",
  in_use: "In procedure",
  turnover: "Turnover",
  blocked: "Blocked",
};

interface SheetState {
  readonly open: boolean;
  readonly defaults: BookCaseDefaults;
}

function shiftDate(date: string, days: number): string {
  return toIsoDate(new Date(Date.parse(`${date}T12:00:00`) + days * DAY_MS));
}

function gridItem(item: ProcedureCase): RoomTimeGridItem {
  return {
    id: item.id,
    roomId: item.roomId,
    start: item.scheduledStart,
    durationMin: item.durationMin,
    phase: item.phase,
    title: item.patient.displayName,
    subtitle: `${item.procedureLabel} · ${item.team.surgeon.name}`,
    meta: item.caseNumber,
    label: `${item.caseNumber} ${item.patient.displayName}, ${item.procedureLabel}`,
  };
}

/** Grid hours: the clinic day, widened to fit any case outside it. */
function hourRange(cases: readonly ProcedureCase[]): { readonly start: number; readonly end: number } {
  const starts = cases.map((item) => new Date(item.scheduledStart));
  const ends = cases.map((item) => new Date(Date.parse(item.scheduledStart) + item.durationMin * 60_000));
  return {
    start: Math.min(CLINIC_START_HOUR, ...starts.map((date) => date.getHours())),
    end: Math.min(24, Math.max(CLINIC_END_HOUR, ...ends.map((date) => date.getHours() + (date.getMinutes() > 0 ? 1 : 0)))),
  };
}

function roomStatus(room: Room): string {
  return ROOM_STATUS_LABEL[room.status];
}

/** `/schedule` — day board by room. `?book=1&patient=<id>&referral=<id>` opens the booking sheet (ids only). */
function ScheduleBoardView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const now = useNow();
  const [date, setDate] = useState(todayIsoDate);
  const [sheet, setSheet] = useState<SheetState>(() => ({
    open: params.get("book") === "1",
    defaults: { patientId: params.get("patient") ?? undefined, referralId: params.get("referral") ?? undefined },
  }));
  const query = useSchedule(date);

  const openSheet = (defaults: BookCaseDefaults) => setSheet({ open: true, defaults: { date, ...defaults } });
  const onSheetOpenChange = (open: boolean) => {
    setSheet((current) => ({ ...current, open }));
    if (!open && params.size > 0) router.replace(pathname, { scroll: false });
  };

  const header = (
    <PageHeader
      eyebrow="Front desk"
      title="Schedule"
      description="Day board by room. Click a case to open its workspace, or an empty slot to book."
      actions={
        <Button onClick={() => openSheet({})} data-testid="schedule-book-case">
          <CalendarPlus aria-hidden /> Book case
        </Button>
      }
    />
  );

  const day = query.data;
  const cases = day?.cases ?? [];
  const active = cases.filter((item) => PHASE_GROUP[item.phase] !== "stopped");
  const hours = hourRange(cases);
  const bookedMin = active.reduce((sum, item) => sum + item.durationMin, 0);
  const groupsPresent = PHASE_GROUP_ORDER.filter((group) => cases.some((item) => PHASE_GROUP[item.phase] === group));

  return (
    <div className="space-y-5" data-testid="schedule-board">
      {header}
      <OfflineBanner />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day" data-testid="schedule-prev-day">
            <ChevronLeft aria-hidden />
          </Button>
          <Button variant="outline" onClick={() => setDate(todayIsoDate())} disabled={date === todayIsoDate()} data-testid="schedule-today">
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day" data-testid="schedule-next-day">
            <ChevronRight aria-hidden />
          </Button>
          <h2 className="ml-2 text-base font-semibold tracking-tight tabular-nums" aria-live="polite" data-testid="schedule-date">
            {formatWeekday(date)}
          </h2>
          <StaleBadge refreshing={query.isFetching && !query.isPending} stale={query.isRefetchError} className="ml-1" />
        </div>
        {day && (
          <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <div className="flex gap-1">
              <dt>Cases</dt>
              <dd className="font-medium text-foreground tabular-nums">{active.length}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Booked</dt>
              <dd className="font-medium text-foreground tabular-nums">{Math.round((bookedMin / 60) * 10) / 10} h</dd>
            </div>
            {groupsPresent.map((group) => (
              <div key={group} className="flex items-center gap-1.5">
                <span aria-hidden className={`size-2 rounded-full ${PHASE_GROUP_DOT[group]}`} />
                <dt className="sr-only">Phase group</dt>
                <dd>{PHASE_GROUP_LABEL[group]}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {query.isPending && <LoadingSkeleton variant="table" rows={8} />}
      {query.isError && !day && (
        <ErrorState title="Could not load the schedule" message="Check your connection and try again." onRetry={() => void query.refetch()} />
      )}
      {day && (
        <>
          {active.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground" data-testid="schedule-empty">
              No cases booked for this day — click an empty slot or <span className="font-medium text-foreground">Book case</span>.
            </p>
          )}
          <RoomTimeGrid
            rooms={day.rooms.map((room) => ({ id: room.id, name: room.name, status: date === todayIsoDate() ? roomStatus(room) : undefined }))}
            items={cases.map(gridItem)}
            date={date}
            startHour={hours.start}
            endHour={hours.end}
            now={new Date(now).toISOString()}
            onItemClick={(caseId) => router.push(`/cases/${caseId}`)}
            onSlotClick={(roomId, startIso) => openSheet({ roomId, startTime: formatTime24(startIso) })}
            className={query.isPlaceholderData ? "opacity-60 transition-opacity" : undefined}
          />
        </>
      )}

      <BookCaseSheet open={sheet.open} onOpenChange={onSheetOpenChange} defaults={sheet.defaults} />
    </div>
  );
}

export function ScheduleBoard() {
  return (
    <Suspense fallback={<LoadingSkeleton variant="table" rows={8} />}>
      <ScheduleBoardView />
    </Suspense>
  );
}
