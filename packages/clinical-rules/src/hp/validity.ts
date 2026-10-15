import { differenceInCalendarDays } from "date-fns";

export interface EvaluateHpValidityParams {
  readonly documentedDate?: string | null;
  readonly updateNoteSignedDate?: string | null;
  readonly procedureDate: string;
}

export interface HpValidityResult {
  readonly status: "satisfied" | "pending" | "failed";
  readonly daysOld: number | null;
  readonly isExpired: boolean;
  readonly requiresUpdateNote: boolean;
  readonly hasUpdateNote: boolean;
  readonly message: string;
}

/**
 * Normalizes an ISO-8601 date string or timestamp into a UTC calendar Date
 * at 12:00:00 UTC to guarantee deterministic calendar-day arithmetic.
 */
function parseToUtcCalendarDate(dateString: string): Date {
  const datePart = dateString.includes("T") ? dateString.split("T")[0]! : dateString.slice(0, 10);
  const [yearStr, monthStr, dayStr] = datePart.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  }
  return new Date(dateString);
}

/**
 * Computes CMS 42 CFR § 416.52 H&P currency and day-of interval update note requirement:
 * 1. Missing H&P -> pending ("H&P not on file").
 * 2. > 30 calendar days old -> failed, isExpired: true (CMS 30-day validity window).
 * 3. 0 days old (documented today) -> satisfied (no update note required).
 * 4. 1–30 calendar days old -> requires signed day-of update note:
 *    - if signed -> satisfied.
 *    - if unsigned -> pending.
 */
export function evaluateHpValidity(params: EvaluateHpValidityParams): HpValidityResult {
  const { documentedDate, updateNoteSignedDate, procedureDate } = params;

  if (!documentedDate) {
    return {
      status: "pending",
      daysOld: null,
      isExpired: false,
      requiresUpdateNote: false,
      hasUpdateNote: false,
      message: "H&P not on file.",
    };
  }

  const docDate = parseToUtcCalendarDate(documentedDate);
  const procDate = parseToUtcCalendarDate(procedureDate);
  const rawDiff = differenceInCalendarDays(procDate, docDate);
  const daysOld = Math.max(0, rawDiff);
  const hasUpdate = Boolean(updateNoteSignedDate);

  if (daysOld > 30) {
    return {
      status: "failed",
      daysOld,
      isExpired: true,
      requiresUpdateNote: false,
      hasUpdateNote: hasUpdate,
      message: `H&P documented ${daysOld} days before procedure exceeds 30-day CMS validity limit (42 CFR § 416.52). Requires new evaluation or clinical override.`,
    };
  }

  if (daysOld === 0) {
    return {
      status: "satisfied",
      daysOld: 0,
      isExpired: false,
      requiresUpdateNote: false,
      hasUpdateNote: hasUpdate,
      message: "H&P documented day of procedure; valid without update note.",
    };
  }

  // 1 to 30 days old
  if (hasUpdate) {
    return {
      status: "satisfied",
      daysOld,
      isExpired: false,
      requiresUpdateNote: true,
      hasUpdateNote: true,
      message: `H&P documented ${daysOld} days before procedure is valid with signed day-of interval update note.`,
    };
  }

  return {
    status: "pending",
    daysOld,
    isExpired: false,
    requiresUpdateNote: true,
    hasUpdateNote: false,
    message: `H&P documented ${daysOld} days before procedure requires a signed day-of interval update note.`,
  };
}
