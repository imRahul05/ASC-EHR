import { describe, expect, it } from "vitest";
import {
  DEFAULT_FACILITY_TIMEZONE,
  facilityDateTimeToIso,
  formatDate,
  formatDateTime,
  formatDuration,
  formatTime24,
  formatWeekday,
  futureIsoDate,
  isoToFacilityTime,
  minutesBetween,
  todayIsoDate,
  toIsoDate,
} from "./time.js";

describe("Clinical Time & Facility Timezone", () => {
  describe("facilityDateTimeToIso", () => {
    it("converts summer EDT date and time to UTC ISO string (UTC-4)", () => {
      // EDT is UTC-4
      const iso = facilityDateTimeToIso("2026-07-15", "08:30", "America/New_York");
      expect(iso).toBe("2026-07-15T12:30:00.000Z");
    });

    it("converts winter EST date and time to UTC ISO string (UTC-5)", () => {
      // EST is UTC-5
      const iso = facilityDateTimeToIso("2026-01-15", "08:30", "America/New_York");
      expect(iso).toBe("2026-01-15T13:30:00.000Z");
    });

    it("converts autumn EDT date and time correctly", () => {
      const iso = facilityDateTimeToIso("2026-10-14", "09:00", DEFAULT_FACILITY_TIMEZONE);
      expect(iso).toBe("2026-10-14T13:00:00.000Z");
    });

    it("throws on invalid date/time input", () => {
      expect(() => facilityDateTimeToIso("bad-date", "09:00")).toThrow();
      expect(() => facilityDateTimeToIso("2026-10-14", "bad-time")).toThrow();
    });
  });

  describe("isoToFacilityTime", () => {
    it("extracts 24h facility local hour and minute from UTC instant", () => {
      const timeSummer = isoToFacilityTime("2026-07-15T12:30:00.000Z", "America/New_York");
      expect(timeSummer).toEqual({ hour: 8, minute: 30 });

      const timeWinter = isoToFacilityTime("2026-01-15T13:30:00.000Z", "America/New_York");
      expect(timeWinter).toEqual({ hour: 8, minute: 30 });
    });
  });

  describe("formatTime24", () => {
    it("formats 24h time in facility timezone", () => {
      expect(formatTime24("2026-07-15T12:30:00.000Z", "America/New_York")).toBe("08:30");
      expect(formatTime24("2026-01-15T13:30:00.000Z", "America/New_York")).toBe("08:30");
      expect(formatTime24("2026-10-14T21:05:00.000Z", "America/New_York")).toBe("17:05");
    });
  });

  describe("toIsoDate, todayIsoDate, and futureIsoDate", () => {
    it("formats calendar date in facility timezone", () => {
      // 03:00 UTC on Oct 16 is 23:00 EDT on Oct 15 in New York
      const testDate = new Date("2026-10-16T03:00:00.000Z");
      expect(toIsoDate(testDate, "America/New_York")).toBe("2026-10-15");
    });

    it("todayIsoDate returns valid YYYY-MM-DD", () => {
      const today = todayIsoDate();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("futureIsoDate returns a future date string", () => {
      const future = futureIsoDate(1);
      expect(future).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(future >= todayIsoDate()).toBe(true);
    });
  });

  describe("formatting helpers", () => {
    it("formats dates and durations cleanly", () => {
      expect(formatDuration(45)).toBe("45 min");
      expect(formatDuration(90)).toBe("1 h 30 min");
      expect(formatDate("2026-10-14T13:00:00.000Z")).toContain("Oct");
      expect(formatWeekday("2026-10-14T13:00:00.000Z")).toContain("Oct");
      expect(formatDate("2026-09-28")).toBe("Sep 28, 2026");
      expect(formatWeekday("2026-09-28")).toBe("Mon, Sep 28");
      expect(formatDateTime("2026-10-14T13:00:00.000Z")).toContain("09:00");
      expect(minutesBetween("2026-10-14T13:00:00.000Z", "2026-10-14T13:45:00.000Z")).toBe(45);
    });
  });
});
