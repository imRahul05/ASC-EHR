/**
 * Endoscope 168-Hour Sterile Storage Hang-Time & AER Reprocessing Verification Rule Engine.
 * Multi-Society Guideline ASGE/SGNA/CDC/AAMI ST91 & CMS 42 CFR § 416.44(b).
 * Master Build Specification AC-I-05-1..4: Zero waivers permitted. This hard gate has NO override.
 */
export const MAXIMUM_SCOPE_HANG_TIME_HOURS = 168;

export interface ScopeLockEvaluationInput {
  readonly scopeSerial: string;
  readonly scopeModel?: string;
  readonly reprocessedAt: string;
  readonly assignedAt: string;
  readonly leakTestResult: "PASS" | "FAIL";
  readonly cycleOutcome: "PASS" | "FAIL";
}

export interface ScopeLockEvaluationResult {
  readonly ok: boolean;
  readonly overridable: false;
  readonly hangTimeHours: number;
  readonly withinHangTimeWindow: boolean;
  readonly reasons: readonly string[];
  readonly blockerCodes: readonly string[];
}

export function evaluateScopeAssignment(
  input: ScopeLockEvaluationInput,
  nowMs: number = Date.now(),
): ScopeLockEvaluationResult {
  const reprocessedMs = Date.parse(input.reprocessedAt);
  const assignedMs = Date.parse(input.assignedAt);

  if (Number.isNaN(reprocessedMs) || Number.isNaN(assignedMs)) {
    return { ok: false, overridable: false, hangTimeHours: 0, withinHangTimeWindow: false, reasons: ["Invalid timestamp provided for endoscope evaluation."], blockerCodes: ["INVALID_TIMESTAMP"] };
  }
  // Enforce chronological integrity (LM-021, LM-027): Reprocessing cannot occur after case assignment
  if (assignedMs < reprocessedMs) {
    return { ok: false, overridable: false, hangTimeHours: 0, withinHangTimeWindow: false, reasons: ["Endoscope reprocessing timestamp cannot be after case assignment timestamp."], blockerCodes: ["CHRONOLOGICAL_ORDER_VIOLATION"] };
  }
  // Reject future timestamps with 60s grace window
  if (reprocessedMs > nowMs + 60_000 || assignedMs > nowMs + 60_000) {
    return { ok: false, overridable: false, hangTimeHours: 0, withinHangTimeWindow: false, reasons: ["Endoscope timestamps cannot be in the future."], blockerCodes: ["FUTURE_TIMESTAMP_PROHIBITED"] };
  }

  const elapsedMs = assignedMs - reprocessedMs;
  // Raw millisecond comparison: exactly 168 hours (168 * 3_600_000 ms) without rounding down grace (ST91:2021)
  const withinHangTimeWindow = elapsedMs <= MAXIMUM_SCOPE_HANG_TIME_HOURS * 3_600_000;
  const hangTimeHours = Math.round((elapsedMs / (1000 * 60 * 60)) * 10) / 10;
  const reasons: string[] = [];
  const blockerCodes: string[] = [];

  if (input.leakTestResult !== "PASS") {
    blockerCodes.push("SCOPE_LEAK_TEST_FAILED");
    reasons.push(`Endoscope ${input.scopeSerial} failed pre-cleaning leak test. Risk of channel breach and fluid invasion.`);
  }
  if (input.cycleOutcome !== "PASS") {
    blockerCodes.push("SCOPE_CYCLE_FAILED");
    reasons.push(`Endoscope ${input.scopeSerial} AER cycle outcome was FAIL. Disinfection cycle incomplete.`);
  }
  if (!withinHangTimeWindow) {
    blockerCodes.push("SCOPE_HANG_TIME_EXPIRED");
    reasons.push(`Endoscope ${input.scopeSerial} hang time (${hangTimeHours}h) exceeds maximum 168-hour limit. Must return to sterile processing.`);
  }

  return { ok: blockerCodes.length === 0, overridable: false, hangTimeHours, withinHangTimeWindow, reasons, blockerCodes };
}
