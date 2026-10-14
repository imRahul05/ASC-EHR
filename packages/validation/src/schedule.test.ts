import { describe, expect, it } from "vitest";
import { getScheduleQuerySchema } from "./schedule.js";

describe("getScheduleQuerySchema", () => {
  it("accepts valid date and facilityId", () => {
    const valid = getScheduleQuerySchema.safeParse({
      date: "2026-10-14",
      facilityId: "fac-a",
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.date).toBe("2026-10-14");
      expect(valid.data.facilityId).toBe("fac-a");
    }
  });

  it("accepts empty query parameters (both optional)", () => {
    const valid = getScheduleQuerySchema.safeParse({});
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.date).toBeUndefined();
      expect(valid.data.facilityId).toBeUndefined();
    }
  });

  it("rejects invalid date format", () => {
    const invalid = getScheduleQuerySchema.safeParse({ date: "10-14-2026" });
    expect(invalid.success).toBe(false);
  });

  it("rejects calendar-invalid dates such as Feb 31 or Month 13", () => {
    const invalidFeb31 = getScheduleQuerySchema.safeParse({ date: "2026-02-31" });
    expect(invalidFeb31.success).toBe(false);

    const invalidMonth13 = getScheduleQuerySchema.safeParse({ date: "2026-13-01" });
    expect(invalidMonth13.success).toBe(false);
  });

  it("accepts leap year Feb 29 and rejects non-leap Feb 29", () => {
    const leapYear = getScheduleQuerySchema.safeParse({ date: "2024-02-29" });
    expect(leapYear.success).toBe(true);

    const nonLeapYear = getScheduleQuerySchema.safeParse({ date: "2025-02-29" });
    expect(nonLeapYear.success).toBe(false);
  });

  it("rejects empty facilityId", () => {
    const invalid = getScheduleQuerySchema.safeParse({ facilityId: "   " });
    expect(invalid.success).toBe(false);
  });
});
