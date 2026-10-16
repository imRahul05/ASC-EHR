import { describe, expect, it } from "vitest";
import { evaluateWithdrawalQuality, withdrawalMinutes, WITHDRAWAL_BENCHMARK_MIN } from "./scores.js";
import type { ProcedureEvent } from "@asc/types";

describe("evaluateWithdrawalQuality", () => {
  it("confirms withdrawal time meeting the ASGE 6.0 min benchmark", () => {
    const result = evaluateWithdrawalQuality("2026-10-16T10:00:00.000Z", "2026-10-16T10:07:30.000Z");
    expect(result.withdrawalMinutes).toBe(7.5);
    expect(result.meetsBenchmark).toBe(true);
    expect(result.compliant).toBe(true);
    expect(result.benchmarkMinutes).toBe(WITHDRAWAL_BENCHMARK_MIN);
    expect(result.message).toContain("meets the ASGE quality indicator");
  });

  it("identifies withdrawal time below the ASGE 6.0 min benchmark", () => {
    const result = evaluateWithdrawalQuality("2026-10-16T10:00:00.000Z", "2026-10-16T10:04:12.000Z");
    expect(result.withdrawalMinutes).toBe(4.2);
    expect(result.meetsBenchmark).toBe(false);
  });

  it("throws on invalid or chronologically inverted timestamps", () => {
    expect(() => evaluateWithdrawalQuality("bad", "2026-10-16T10:05:00.000Z")).toThrow("Invalid ISO timestamp");
    expect(() => evaluateWithdrawalQuality("2026-10-16T10:10:00.000Z", "2026-10-16T10:05:00.000Z")).toThrow("cannot precede");
  });
});

describe("withdrawalMinutes", () => {
  it("calculates withdrawal minutes from events or returns null", () => {
    const events: ProcedureEvent[] = [
      { id: "e-1", caseId: "c-1", type: "CECUM_REACHED", at: "2026-10-16T10:00:00.000Z", by: { id: "u-1", name: "Doc", initials: "D" } },
      { id: "e-2", caseId: "c-1", type: "SCOPE_OUT", at: "2026-10-16T10:06:18.000Z", by: { id: "u-1", name: "Doc", initials: "D" } },
    ];
    expect(withdrawalMinutes(events)).toBe(6.3);
    expect(withdrawalMinutes([])).toBeNull();
  });
});
