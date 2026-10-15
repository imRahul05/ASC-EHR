import { describe, expect, it } from "vitest";
import type { ScheduleDay } from "@asc/types";
import { resolveSchedulePlaceholderData } from "./hooks";

describe("resolveSchedulePlaceholderData", () => {
  const dummyDay: ScheduleDay = {
    date: "2026-10-15",
    rooms: [],
    cases: [],
  };

  it("retains previousData when facilityId matches the previous query", () => {
    const result = resolveSchedulePlaceholderData(dummyDay, "fac-1", "fac-1");
    expect(result).toBe(dummyDay);
  });

  it("clears previousData (returns undefined) when switching to a different facility", () => {
    const result = resolveSchedulePlaceholderData(dummyDay, "fac-1", "fac-2");
    expect(result).toBeUndefined();
  });

  it("clears previousData when previousQuery has no facility but new query has one", () => {
    const result = resolveSchedulePlaceholderData(dummyDay, "", "fac-1");
    expect(result).toBeUndefined();
  });

  it("retains previousData when both queries have no facility", () => {
    const result = resolveSchedulePlaceholderData(dummyDay, undefined, undefined);
    expect(result).toBe(dummyDay);
  });
});
