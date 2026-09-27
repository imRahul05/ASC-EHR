import type { GateCheck, RuleReason, RuleResult } from "@asc/types";

/** One checklist item of a gate: stable code, UI label, failure message. */
export interface CheckSpec {
  readonly code: string;
  readonly label: string;
  readonly ok: boolean;
  readonly message: string;
}

export const OK: RuleResult = { ok: true, reasons: [] };

export function fail(code: string, message: string): RuleResult {
  return { ok: false, reasons: [{ code, message }] };
}

/** Builds a RuleResult (with its full checklist) from check specs. */
export function fromChecks(specs: readonly CheckSpec[]): RuleResult {
  const checks: GateCheck[] = specs.map(({ code, label, ok }) => ({ code, label, ok }));
  const reasons: RuleReason[] = specs.filter((spec) => !spec.ok).map(({ code, message }) => ({ code, message }));
  return { ok: reasons.length === 0, reasons, checks };
}

/** Merges several results; ok only if all are ok. */
export function combine(...results: readonly RuleResult[]): RuleResult {
  const reasons = results.flatMap((result) => result.reasons);
  const checks = results.flatMap((result) => result.checks ?? []);
  return { ok: reasons.length === 0, reasons, ...(checks.length > 0 ? { checks } : {}) };
}
