/**
 * Clinical time formatting (ui-guidelines §7: 24 h clock in clinical areas, relative time only as a hint).
 * Standardized to the ASC facility time zone (defaults to "America/New_York").
 */
import type { IsoDate, IsoDateTime } from "@asc/types";

export const DEFAULT_FACILITY_TIMEZONE = "America/New_York";

const MINUTE_MS = 60_000;

export type DstDisambiguation = "earlier" | "later" | "reject";

export interface FacilityDateTimeOptions {
  readonly timeZone?: string;
  readonly disambiguation?: DstDisambiguation;
}

/**
 * Converts a facility-local calendar date `YYYY-MM-DD` and local time `HH:mm`
 * into an absolute UTC ISO 8601 instant string (`YYYY-MM-DDTHH:mm:00.000Z`).
 * Operates deterministically across all environments regardless of host/browser timezone.
 *
 * DST handling:
 * - Spring-forward gaps (nonexistent local times): strictly rejected with a clear error.
 * - Fall-back overlaps (ambiguous local times): handled per explicit disambiguation policy
 *   ("earlier" | "later" | "reject", default: "earlier").
 */
export function facilityDateTimeToIso(
  dateStr: string,
  timeStr: string,
  timeZoneOrOptions: string | FacilityDateTimeOptions = DEFAULT_FACILITY_TIMEZONE,
): string {
  const timeZone =
    typeof timeZoneOrOptions === "string"
      ? timeZoneOrOptions
      : (timeZoneOrOptions.timeZone ?? DEFAULT_FACILITY_TIMEZONE);
  const disambiguation: DstDisambiguation =
    typeof timeZoneOrOptions === "object" && timeZoneOrOptions.disambiguation
      ? timeZoneOrOptions.disambiguation
      : "earlier";

  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const [hourStr, minStr] = timeStr.split(":");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minStr);

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    throw new Error(`Invalid facility date/time: ${dateStr} ${timeStr}`);
  }

  const targetLocalUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });

  function getFacilityLocalUtcMs(testUtcMs: number): number {
    const parts = formatter.formatToParts(new Date(testUtcMs));
    let y = year;
    let m = month;
    let d = day;
    let h = hour;
    let min = minute;
    let s = 0;
    for (const part of parts) {
      if (part.type === "year") y = Number(part.value);
      else if (part.type === "month") m = Number(part.value);
      else if (part.type === "day") d = Number(part.value);
      else if (part.type === "hour") h = Number(part.value);
      else if (part.type === "minute") min = Number(part.value);
      else if (part.type === "second") s = Number(part.value);
    }
    return Date.UTC(y, m - 1, d, h, min, s, 0);
  }

  function matchesLocal(testUtcMs: number): boolean {
    const parts = formatter.formatToParts(new Date(testUtcMs));
    let py = 0;
    let pm = 0;
    let pd = 0;
    let ph = 0;
    let pmin = 0;
    for (const part of parts) {
      if (part.type === "year") py = Number(part.value);
      else if (part.type === "month") pm = Number(part.value);
      else if (part.type === "day") pd = Number(part.value);
      else if (part.type === "hour") ph = Number(part.value);
      else if (part.type === "minute") pmin = Number(part.value);
    }
    return py === year && pm === month && pd === day && ph === hour && pmin === minute;
  }

  let candidateUtcMs = targetLocalUtcMs;
  let facilityLocalUtcMs = getFacilityLocalUtcMs(candidateUtcMs);
  const offsetMs = targetLocalUtcMs - facilityLocalUtcMs;
  candidateUtcMs += offsetMs;

  facilityLocalUtcMs = getFacilityLocalUtcMs(candidateUtcMs);
  const secondaryDiff = targetLocalUtcMs - facilityLocalUtcMs;
  if (secondaryDiff !== 0) {
    candidateUtcMs += secondaryDiff;
  }

  // Round-trip verification: verify that candidate instant reproduces the requested local date/time
  if (!matchesLocal(candidateUtcMs)) {
    throw new Error(
      `Nonexistent local time in timezone ${timeZone} due to daylight saving transition: ${dateStr} ${timeStr}`,
    );
  }

  // Ambiguity check: check if candidate ± 1 hour also matches the requested local date/time (fall-back transition)
  const earlierMatch = matchesLocal(candidateUtcMs - 3600_000);
  const laterMatch = matchesLocal(candidateUtcMs + 3600_000);
  const isAmbiguous = earlierMatch || laterMatch;

  if (isAmbiguous) {
    if (disambiguation === "reject") {
      throw new Error(
        `Ambiguous local time in timezone ${timeZone} due to daylight saving transition: ${dateStr} ${timeStr}`,
      );
    }
    if (disambiguation === "later") {
      const finalMs = laterMatch ? candidateUtcMs + 3600_000 : candidateUtcMs;
      return new Date(finalMs).toISOString();
    }
    const finalMs = earlierMatch ? candidateUtcMs - 3600_000 : candidateUtcMs;
    return new Date(finalMs).toISOString();
  }

  return new Date(candidateUtcMs).toISOString();
}

/**
 * Extracts the facility-local hour and minute (24h format) from an ISO instant.
 */
export function isoToFacilityTime(
  iso: IsoDateTime,
  timeZone: string = DEFAULT_FACILITY_TIMEZONE,
): { readonly hour: number; readonly minute: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(new Date(iso));
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    if (part.type === "hour") hour = Number(part.value);
    else if (part.type === "minute") minute = Number(part.value);
  }
  return { hour, minute };
}

/** `14:05` formatted in facility timezone */
export function formatTime24(
  iso: IsoDateTime,
  timeZone: string = DEFAULT_FACILITY_TIMEZONE,
): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return formatter.format(new Date(iso));
}

function parseIsoDateToUtcNoon(iso: string): Date {
  if (iso.length === 10) {
    const [yearStr, monthStr, dayStr] = iso.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
      return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    }
  }
  return new Date(iso);
}

/** `Sep 28, 2026` in facility timezone (accepts `YYYY-MM-DD` or an ISO instant). */
export function formatDate(
  iso: IsoDateTime,
  timeZone: string = DEFAULT_FACILITY_TIMEZONE,
): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return formatter.format(parseIsoDateToUtcNoon(iso));
}

/** `Mon, Sep 28` in facility timezone */
export function formatWeekday(
  iso: IsoDateTime,
  timeZone: string = DEFAULT_FACILITY_TIMEZONE,
): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return formatter.format(parseIsoDateToUtcNoon(iso));
}

/** `Sep 28, 14:05` in facility timezone */
export function formatDateTime(
  iso: IsoDateTime,
  timeZone: string = DEFAULT_FACILITY_TIMEZONE,
): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return formatter.format(new Date(iso));
}

/** Whole minutes between two instants (default end: now). */
export function minutesBetween(startIso: IsoDateTime, endIso?: IsoDateTime): number {
  const end = endIso ? Date.parse(endIso) : Date.now();
  return Math.max(0, Math.floor((end - Date.parse(startIso)) / MINUTE_MS));
}

/** `42 min` / `1 h 05 min` */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/** Local calendar date `YYYY-MM-DD` of a Date in facility timezone. */
export function toIsoDate(
  date: Date,
  timeZone: string = DEFAULT_FACILITY_TIMEZONE,
): IsoDate {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

export function todayIsoDate(timeZone: string = DEFAULT_FACILITY_TIMEZONE): IsoDate {
  return toIsoDate(new Date(), timeZone);
}

export function futureIsoDate(
  daysAhead = 1,
  timeZone: string = DEFAULT_FACILITY_TIMEZONE,
): IsoDate {
  return toIsoDate(new Date(Date.now() + daysAhead * 24 * 3600_000), timeZone);
}
