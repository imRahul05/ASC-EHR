import { describe, expect, it } from "vitest";
import { parseMedicationText } from "./patient.js";

describe("parseMedicationText", () => {
  it("splits a referral medication list into name, dose and frequency", () => {
    expect(parseMedicationText("warfarin 5 mg daily (AFib), levothyroxine 75 mcg")).toEqual([
      { name: "warfarin", dose: "5 mg", frequency: "daily" },
      { name: "levothyroxine", dose: "75 mcg", frequency: "" },
    ]);
  });

  it("keeps undosed names and ignores empty / none", () => {
    expect(parseMedicationText("aspirin; none")).toEqual([{ name: "aspirin", dose: "", frequency: "" }]);
    expect(parseMedicationText("")).toEqual([]);
  });
});
