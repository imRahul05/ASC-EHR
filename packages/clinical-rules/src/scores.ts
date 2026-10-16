import type { AldreteInput, BbpsScore, IsoDate, ProcedureEvent } from "@asc/types";

const MINUTE_MS = 60_000;

export const ALDRETE_COMPONENTS: readonly (keyof AldreteInput)[] = [
  "activity",
  "respiration",
  "circulation",
  "consciousness",
  "oxygenSaturation",
];

/** Modified Aldrete total (0–10). */
export function aldreteTotal(input: AldreteInput): number {
  return ALDRETE_COMPONENTS.reduce((sum, key) => sum + input[key], 0);
}

/** Minimum withdrawal time quality benchmark (minutes). */
export const WITHDRAWAL_BENCHMARK_MIN = 6;

/**
 * ASGE/ACG 2022 Quality Indicators for GI Endoscopy:
 * Colonoscopy withdrawal time benchmark is >= 6.0 minutes.
 * A mean withdrawal time >= 6 minutes in normal screening colonoscopies is directly correlated
 * with increased adenoma detection rate (ADR) and reduced post-colonoscopy colorectal cancer.
 */
export interface WithdrawalQualityResult {
  readonly withdrawalMinutes: number;
  readonly meetsBenchmark: boolean;
  readonly benchmarkMinutes: number;
  readonly compliant: boolean;
  readonly message: string;
}

export function evaluateWithdrawalQuality(
  cecumReachedIso: string,
  scopeOutIso: string,
): WithdrawalQualityResult {
  const startMs = Date.parse(cecumReachedIso);
  const endMs = Date.parse(scopeOutIso);

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    throw new Error("Invalid ISO timestamp provided for withdrawal quality evaluation.");
  }

  if (endMs < startMs) {
    throw new Error("Scope out timestamp cannot precede cecum reached timestamp.");
  }

  const minutes = (endMs - startMs) / MINUTE_MS;
  const withdrawalMinutes = Math.round(minutes * 10) / 10;
  const meetsBenchmark = withdrawalMinutes >= WITHDRAWAL_BENCHMARK_MIN;

  return {
    withdrawalMinutes,
    meetsBenchmark,
    benchmarkMinutes: WITHDRAWAL_BENCHMARK_MIN,
    compliant: meetsBenchmark,
    message: meetsBenchmark
      ? `Withdrawal time ${withdrawalMinutes} min meets the ASGE quality indicator (>= ${WITHDRAWAL_BENCHMARK_MIN}.0 min).`
      : `Withdrawal time ${withdrawalMinutes} min is below the ASGE quality indicator (>= ${WITHDRAWAL_BENCHMARK_MIN}.0 min).`,
  };
}

/**
 * Withdrawal time in minutes: WITHDRAWAL_START (or CECUM_REACHED when not tapped) → SCOPE_OUT.
 * Null until both events exist.
 */
export function withdrawalMinutes(events: readonly ProcedureEvent[]): number | null {
  const at = (type: ProcedureEvent["type"]) => events.find((event) => event.type === type)?.at;
  const start = at("WITHDRAWAL_START") ?? at("CECUM_REACHED");
  const end = at("SCOPE_OUT");
  if (!start || !end) return null;
  const minutes = (Date.parse(end) - Date.parse(start)) / MINUTE_MS;
  return minutes >= 0 ? Math.round(minutes * 10) / 10 : null;
}

export function bbpsTotal(score: BbpsScore): number {
  return score.right + score.transverse + score.left;
}

/** Adequate prep: total ≥ 6 and every segment ≥ 2. */
export function bbpsAdequate(score: BbpsScore): boolean {
  return bbpsTotal(score) >= 6 && Math.min(score.right, score.transverse, score.left) >= 2;
}

/** Age in whole years on `at` (default: now). */
export function ageFromDob(dateOfBirth: IsoDate, at: Date = new Date()): number {
  const dob = new Date(`${dateOfBirth}T00:00:00`);
  let age = at.getFullYear() - dob.getFullYear();
  const beforeBirthday = at.getMonth() < dob.getMonth() || (at.getMonth() === dob.getMonth() && at.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}
