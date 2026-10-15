import { describe, expect, it } from "vitest";
import { evaluateHpValidity } from "./validity";

describe("evaluateHpValidity (CMS 42 CFR § 416.52)", () => {
  const procedureDate = "2026-10-15";

  it("returns status: pending with 'H&P not on file' when documentedDate is missing", () => {
    const result = evaluateHpValidity({
      documentedDate: null,
      procedureDate,
    });

    expect(result.status).toBe("pending");
    expect(result.daysOld).toBeNull();
    expect(result.isExpired).toBe(false);
    expect(result.requiresUpdateNote).toBe(false);
    expect(result.hasUpdateNote).toBe(false);
    expect(result.message).toContain("H&P not on file");
  });

  it("returns status: failed with isExpired: true when H&P is older than 30 days (daysOld: 31)", () => {
    // 31 days prior: 2026-09-14 to 2026-10-15
    const result = evaluateHpValidity({
      documentedDate: "2026-09-14",
      procedureDate,
    });

    expect(result.status).toBe("failed");
    expect(result.daysOld).toBe(31);
    expect(result.isExpired).toBe(true);
    expect(result.requiresUpdateNote).toBe(false);
    expect(result.message).toContain("exceeds 30-day");
  });

  it("returns status: pending with requiresUpdateNote: true when H&P is between 1 and 30 days old without day-of update note", () => {
    // 14 days prior: 2026-10-01 to 2026-10-15
    const result = evaluateHpValidity({
      documentedDate: "2026-10-01",
      procedureDate,
    });

    expect(result.status).toBe("pending");
    expect(result.daysOld).toBe(14);
    expect(result.isExpired).toBe(false);
    expect(result.requiresUpdateNote).toBe(true);
    expect(result.hasUpdateNote).toBe(false);
    expect(result.message).toContain("requires a signed day-of interval update note");
  });

  it("returns status: satisfied when H&P was performed today (0 days old)", () => {
    const result = evaluateHpValidity({
      documentedDate: "2026-10-15",
      procedureDate,
    });

    expect(result.status).toBe("satisfied");
    expect(result.daysOld).toBe(0);
    expect(result.isExpired).toBe(false);
    expect(result.requiresUpdateNote).toBe(false);
    expect(result.hasUpdateNote).toBe(false);
  });

  it("returns status: satisfied when H&P is between 1 and 30 days old WITH signed day-of update note", () => {
    const result = evaluateHpValidity({
      documentedDate: "2026-10-01",
      updateNoteSignedDate: "2026-10-15T07:45:00Z",
      procedureDate,
    });

    expect(result.status).toBe("satisfied");
    expect(result.daysOld).toBe(14);
    expect(result.isExpired).toBe(false);
    expect(result.requiresUpdateNote).toBe(true);
    expect(result.hasUpdateNote).toBe(true);
    expect(result.message).toContain("valid with signed day-of interval update note");
  });

  it("handles ISO-8601 date-time strings gracefully", () => {
    const result = evaluateHpValidity({
      documentedDate: "2026-10-05T14:30:00Z",
      procedureDate: "2026-10-15T08:00:00Z",
      updateNoteSignedDate: "2026-10-15T07:15:00Z",
    });

    expect(result.status).toBe("satisfied");
    expect(result.daysOld).toBe(10);
    expect(result.isExpired).toBe(false);
  });
});
