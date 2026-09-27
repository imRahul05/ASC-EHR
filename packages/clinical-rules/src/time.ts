/**
 * Clinical time formatting (ui-guidelines §7: 24 h clock in clinical areas, relative time only as a hint).
 * The mock runs in the browser's zone; P05 pins this to the facility time zone.
 */
import type { IsoDate, IsoDateTime } from "@asc/types";

const MINUTE_MS = 60_000;

const TIME_24 = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const DATE_SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const DATE_WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** `14:05` */
export function formatTime24(iso: IsoDateTime): string {
  return TIME_24.format(new Date(iso));
}

/** `Sep 28, 2026` (accepts `YYYY-MM-DD` or a date-time). */
export function formatDate(iso: IsoDateTime): string {
  return DATE_SHORT.format(new Date(iso.length === 10 ? `${iso}T00:00:00` : iso));
}

/** `Mon, Sep 28` */
export function formatWeekday(iso: IsoDateTime): string {
  return DATE_WEEKDAY.format(new Date(iso.length === 10 ? `${iso}T00:00:00` : iso));
}

/** `Sep 28, 14:05` */
export function formatDateTime(iso: IsoDateTime): string {
  return DATE_TIME.format(new Date(iso));
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

/** Local calendar date `YYYY-MM-DD` of a Date. */
export function toIsoDate(date: Date): IsoDate {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function todayIsoDate(): IsoDate {
  return toIsoDate(new Date());
}
