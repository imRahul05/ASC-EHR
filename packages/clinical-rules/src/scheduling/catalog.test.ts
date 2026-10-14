import { describe, expect, it } from "vitest";

import {
  DEFAULT_DURATION_BY_CPT,
  DEFAULT_PROCEDURE_DURATION_MINUTES,
  defaultDurationForCpt,
} from "./catalog.js";

describe("Procedure duration catalog", () => {
  it("exports standard CPT durations", () => {
    expect(DEFAULT_DURATION_BY_CPT["45378"]).toBe(45);
    expect(DEFAULT_DURATION_BY_CPT["43239"]).toBe(30);
    expect(DEFAULT_DURATION_BY_CPT["45385"]).toBe(45);
    expect(DEFAULT_DURATION_BY_CPT["45380"]).toBe(45);
    expect(DEFAULT_DURATION_BY_CPT["43235"]).toBe(30);
    expect(DEFAULT_DURATION_BY_CPT["45330"]).toBe(30);
  });

  it("returns mapped duration for known CPT codes", () => {
    expect(defaultDurationForCpt("45378")).toBe(45);
    expect(defaultDurationForCpt("43239")).toBe(30);
    expect(defaultDurationForCpt("45385")).toBe(45);
    expect(defaultDurationForCpt("45380")).toBe(45);
    expect(defaultDurationForCpt("43235")).toBe(30);
    expect(defaultDurationForCpt("45330")).toBe(30);
  });

  it("returns 45 minute default when CPT code is undefined or unmapped", () => {
    expect(defaultDurationForCpt()).toBe(DEFAULT_PROCEDURE_DURATION_MINUTES);
    expect(defaultDurationForCpt(undefined)).toBe(45);
    expect(defaultDurationForCpt("")).toBe(45);
    expect(defaultDurationForCpt("99999")).toBe(45);
  });
});
