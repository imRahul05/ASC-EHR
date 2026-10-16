import { describe, expect, it } from "vitest";
import type { VitalsEntry } from "@asc/types";
import { evaluateVitalsAdequacy, findMonitoringGaps } from "../intervals.js";

function createMockVital(recordedAt: string, etco2?: number, spo2 = 98): VitalsEntry {
  return {
    id: `vital-${recordedAt}`,
    caseId: "case-123",
    context: "intra",
    recordedAt,
    hr: 75,
    sbp: 120,
    dbp: 80,
    spo2,
    rr: 14,
    etco2,
    recordedBy: { id: "p1", name: "Dr. Anes", initials: "DA" },
  };
}

describe("aims/intervals (ASA Standards for Basic Anesthetic Monitoring)", () => {
  describe("findMonitoringGaps", () => {
    it("returns no gaps when readings are taken strictly within 5-minute intervals", () => {
      const sedationStart = "2026-10-16T08:00:00.000Z";
      const vitals: VitalsEntry[] = [
        createMockVital("2026-10-16T08:03:00.000Z"), // +3 min
        createMockVital("2026-10-16T08:07:00.000Z"), // +4 min
        createMockVital("2026-10-16T08:12:00.000Z"), // +5.0 min (exactly 5 min)
      ];
      const sedationEnd = "2026-10-16T08:15:00.000Z"; // +3 min from last vital

      const gaps = findMonitoringGaps(vitals, sedationStart, sedationEnd, 5);
      expect(gaps).toEqual([]);
    });

    it("flags gap when delta between consecutive vitals exceeds 5.0 minutes (e.g. 5.01 min)", () => {
      const sedationStart = "2026-10-16T08:00:00.000Z";
      const vitals: VitalsEntry[] = [
        createMockVital("2026-10-16T08:02:00.000Z"),
        createMockVital("2026-10-16T08:07:01.000Z"), // 5 min 1 sec gap (301,000 ms > 300,000 ms)
      ];
      const sedationEnd = "2026-10-16T08:10:00.000Z";

      const gaps = findMonitoringGaps(vitals, sedationStart, sedationEnd, 5);
      expect(gaps).toHaveLength(1);
      expect(gaps[0]?.startIso).toBe("2026-10-16T08:02:00.000Z");
      expect(gaps[0]?.endIso).toBe("2026-10-16T08:07:01.000Z");
      expect(gaps[0]?.gapDurationMinutes).toBe(5);
    });

    it("flags gap if initial vital is delayed more than 5 minutes after sedation start", () => {
      const sedationStart = "2026-10-16T08:00:00.000Z";
      const vitals: VitalsEntry[] = [
        createMockVital("2026-10-16T08:06:00.000Z"), // 6 min delay
      ];
      const sedationEnd = "2026-10-16T08:10:00.000Z";

      const gaps = findMonitoringGaps(vitals, sedationStart, sedationEnd, 5);
      expect(gaps).toHaveLength(1);
      expect(gaps[0]?.startIso).toBe(sedationStart);
      expect(gaps[0]?.endIso).toBe("2026-10-16T08:06:00.000Z");
      expect(gaps[0]?.gapDurationMinutes).toBe(6);
    });

    it("flags terminal gap if sedation end is more than 5 minutes after last vital", () => {
      const sedationStart = "2026-10-16T08:00:00.000Z";
      const vitals: VitalsEntry[] = [
        createMockVital("2026-10-16T08:02:00.000Z"),
        createMockVital("2026-10-16T08:05:00.000Z"),
      ];
      const sedationEnd = "2026-10-16T08:12:00.000Z"; // 7 min after last vital

      const gaps = findMonitoringGaps(vitals, sedationStart, sedationEnd, 5);
      expect(gaps).toHaveLength(1);
      expect(gaps[0]?.startIso).toBe("2026-10-16T08:05:00.000Z");
      expect(gaps[0]?.endIso).toBe(sedationEnd);
      expect(gaps[0]?.gapDurationMinutes).toBe(7);
    });

    it("flags active monitoring gap during ongoing sedation when vitals are overdue", () => {
      const sedationStart = "2026-10-16T08:00:00.000Z";
      const vitals: VitalsEntry[] = [
        createMockVital("2026-10-16T08:02:00.000Z"),
      ];
      // 12 minutes elapsed since last vital at 08:02, ongoing sedation (no sedationEnd)
      const currentNowMs = Date.parse("2026-10-16T08:14:00.000Z");

      const gaps = findMonitoringGaps(vitals, sedationStart, undefined, { maxGapMinutes: 5, nowMs: currentNowMs });
      expect(gaps).toHaveLength(1);
      expect(gaps[0]?.startIso).toBe("2026-10-16T08:02:00.000Z");
      expect(gaps[0]?.endIso).toBe("2026-10-16T08:14:00.000Z");
      expect(gaps[0]?.gapDurationMinutes).toBe(12);
      expect(gaps[0]?.reason).toContain("active sedation");
    });
  });

  describe("evaluateVitalsAdequacy", () => {
    it("returns OK when no sedation started yet", () => {
      const result = evaluateVitalsAdequacy([]);
      expect(result.ok).toBe(true);
    });

    it("fails when sedation is active but no vitals are recorded", () => {
      const result = evaluateVitalsAdequacy([], "2026-10-16T08:00:00.000Z");
      expect(result.ok).toBe(false);
      expect(result.reasons.some((r) => r.code === "ASA_VITALS_RECORDED")).toBe(true);
    });

    it("fails when EtCO2 capnography is not documented during sedation", () => {
      const vitals: VitalsEntry[] = [
        createMockVital("2026-10-16T08:02:00.000Z", undefined, 99), // No EtCO2
      ];
      const result = evaluateVitalsAdequacy(vitals, "2026-10-16T08:00:00.000Z");
      expect(result.ok).toBe(false);
      expect(result.reasons.some((r) => r.code === "ASA_VENTILATION_ETCO2")).toBe(true);
    });

    it("passes when all ASA criteria (EtCO2, SpO2, and <= 5min intervals) are met", () => {
      const vitals: VitalsEntry[] = [
        createMockVital("2026-10-16T08:02:00.000Z", 38, 99),
        createMockVital("2026-10-16T08:06:00.000Z", 36, 98),
      ];
      const result = evaluateVitalsAdequacy(vitals, "2026-10-16T08:00:00.000Z", "2026-10-16T08:08:00.000Z");
      expect(result.ok).toBe(true);
      expect(result.reasons).toEqual([]);
    });
  });
});
