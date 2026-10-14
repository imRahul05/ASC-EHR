import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
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
    !yearStr ||
    !monthStr ||
    !dayStr ||
    !hourStr ||
    !minStr ||
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    throw new Error(`Invalid facility date/time: ${dateStr} ${timeStr}`);
  }

  // Construct instant using numeric components in target facility timezone
  const candidate = new TZDate(year, month - 1, day, hour, minute, 0, 0, timeZone);

  // Spring-forward gap check: if TZDate rolled over, the local time does not exist
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day ||
    candidate.getHours() !== hour ||
    candidate.getMinutes() !== minute
  ) {
    throw new Error(
      `Nonexistent local time in timezone ${timeZone} due to daylight saving transition: ${dateStr} ${timeStr}`,
    );
  }

  // Fall-back ambiguity check: verify if candidate ± 1 hour also matches the requested local date/time
  const earlierCandidate = new TZDate(candidate.getTime() - 3600_000, timeZone);
  const laterCandidate = new TZDate(candidate.getTime() + 3600_000, timeZone);

  const earlierMatches =
    earlierCandidate.getFullYear() === year &&
    earlierCandidate.getMonth() === month - 1 &&
    earlierCandidate.getDate() === day &&
    earlierCandidate.getHours() === hour &&
    earlierCandidate.getMinutes() === minute;

  const laterMatches =
    laterCandidate.getFullYear() === year &&
    laterCandidate.getMonth() === month - 1 &&
    laterCandidate.getDate() === day &&
    laterCandidate.getHours() === hour &&
    laterCandidate.getMinutes() === minute;

  const isAmbiguous = earlierMatches || laterMatches;

  if (isAmbiguous) {
    if (disambiguation === "reject") {
      throw new Error(
        `Ambiguous local time in timezone ${timeZone} due to daylight saving transition: ${dateStr} ${timeStr}`,
      );
    }
    if (disambiguation === "later") {
      const finalCandidate = laterMatches ? laterCandidate : candidate;
      return new Date(finalCandidate.getTime()).toISOString();
    }
    const finalCandidate = earlierMatches ? earlierCandidate : candidate;
    return new Date(finalCandidate.getTime()).toISOString();
  }

  return new Date(candidate.getTime()).toISOString();
}

/**
 * Extracts the facility-local hour and minute (24h format) from an ISO instant.
 */
export function isoToFacilityTime(
  iso: IsoDateTime,
  timeZone: string = DEFAULT_FACILITY_TIMEZONE,
): { readonly hour: number; readonly minute: number } {
  const date = new TZDate(new Date(iso), timeZone);
  return { hour: date.getHours(), minute: date.getMinutes() };
}

/** `14:05` formatted in facility timezone */
export function formatTime24(
  iso: IsoDateTime,
  timeZone: string = DEFAULT_FACILITY_TIMEZONE,
): string {
  const date = new TZDate(new Date(iso), timeZone);
  return format(date, "HH:mm");
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
  const date = new TZDate(parseIsoDateToUtcNoon(iso), timeZone);
  return format(date, "MMM d, yyyy");
}

/** `Mon, Sep 28` in facility timezone */
export function formatWeekday(
  iso: IsoDateTime,
  timeZone: string = DEFAULT_FACILITY_TIMEZONE,
): string {
  const date = new TZDate(parseIsoDateToUtcNoon(iso), timeZone);
  return format(date, "EEE, MMM d");
}

/** `Sep 28, 14:05` in facility timezone */
export function formatDateTime(
  iso: IsoDateTime,
  timeZone: string = DEFAULT_FACILITY_TIMEZONE,
): string {
  const date = new TZDate(new Date(iso), timeZone);
  return format(date, "MMM d, HH:mm");
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
  const tzDate = new TZDate(date, timeZone);
  return format(tzDate, "yyyy-MM-dd");
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
