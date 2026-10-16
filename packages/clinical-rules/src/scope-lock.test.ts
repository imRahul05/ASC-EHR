import { describe, expect, it } from "vitest";
import { evaluateScopeAssignment } from "./scope-lock.js";

describe("evaluateScopeAssignment", () => {
  const baseInput = {
    scopeSerial: "OLY-CF-H190L-4412",
    scopeModel: "Olympus CF-HQ190L",
    reprocessedAt: "2026-10-14T10:00:00.000Z",
    assignedAt: "2026-10-15T10:00:00.000Z", // 24 hours
    leakTestResult: "PASS" as const,
    cycleOutcome: "PASS" as const,
  };

  it("approves endoscope within 168 hours with passing leak and cycle tests", () => {
    const result = evaluateScopeAssignment(baseInput);
    expect(result.ok).toBe(true);
    expect(result.overridable).toBe(false);
    expect(result.hangTimeHours).toBe(24);
    expect(result.withinHangTimeWindow).toBe(true);
  });

  it("rejects endoscope exceeding 168-hour hang time (AC-I-05-3)", () => {
    const expired = { ...baseInput, reprocessedAt: "2026-09-20T10:00:00.000Z" };
    const result = evaluateScopeAssignment(expired);
    expect(result.ok).toBe(false);
    expect(result.blockerCodes).toContain("SCOPE_HANG_TIME_EXPIRED");
  });

  it("strictly enforces 168-hour ceiling at millisecond precision without rounding-down grace (ST91:2021)", () => {
    // 168 hours + 2 minutes = 168.033 hours. Previously Math.round(168.033 * 10) / 10 = 168.0 passed!
    const reprocessed = new Date("2026-10-01T00:00:00.000Z");
    const assigned = new Date(reprocessed.getTime() + 168 * 3600_000 + 120_000); // +2 minutes
    const result = evaluateScopeAssignment({
      ...baseInput,
      reprocessedAt: reprocessed.toISOString(),
      assignedAt: assigned.toISOString(),
    });
    expect(result.withinHangTimeWindow).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.blockerCodes).toContain("SCOPE_HANG_TIME_EXPIRED");
  });

  it("rejects endoscope with failed leak test (AC-I-05-1)", () => {
    const result = evaluateScopeAssignment({ ...baseInput, leakTestResult: "FAIL" });
    expect(result.ok).toBe(false);
    expect(result.blockerCodes).toContain("SCOPE_LEAK_TEST_FAILED");
  });

  it("rejects endoscope with failed AER cycle outcome (AC-I-05-2)", () => {
    const result = evaluateScopeAssignment({ ...baseInput, cycleOutcome: "FAIL" });
    expect(result.ok).toBe(false);
    expect(result.blockerCodes).toContain("SCOPE_CYCLE_FAILED");
  });

  it("accumulates all blocker codes when multiple checks fail", () => {
    const multi = { ...baseInput, reprocessedAt: "2026-09-20T10:00:00.000Z", leakTestResult: "FAIL" as const, cycleOutcome: "FAIL" as const };
    const result = evaluateScopeAssignment(multi);
    expect(result.blockerCodes).toEqual(["SCOPE_LEAK_TEST_FAILED", "SCOPE_CYCLE_FAILED", "SCOPE_HANG_TIME_EXPIRED"]);
  });

  it("rejects invalid timestamps, chronological anomalies, and future timestamps", () => {
    expect(evaluateScopeAssignment({ ...baseInput, reprocessedAt: "bad" }).blockerCodes).toContain("INVALID_TIMESTAMP");
    expect(evaluateScopeAssignment({ ...baseInput, reprocessedAt: "2026-10-15T12:00:00.000Z", assignedAt: "2026-10-15T10:00:00.000Z" }).blockerCodes).toContain("CHRONOLOGICAL_ORDER_VIOLATION");
    expect(evaluateScopeAssignment({ ...baseInput, assignedAt: new Date(Date.now() + 86_400_000).toISOString() }).blockerCodes).toContain("FUTURE_TIMESTAMP_PROHIBITED");
  });
});
