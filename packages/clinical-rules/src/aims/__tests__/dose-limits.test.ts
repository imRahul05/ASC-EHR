import { describe, expect, it } from "vitest";
import type { DrugDose } from "@asc/types";
import { evaluateCumulativeDoses } from "../dose-limits.js";

function createMockDose(drug: DrugDose["drug"], amount: number, unit: DrugDose["unit"]): DrugDose {
  return {
    id: `dose-${Math.random()}`,
    drug,
    amount,
    unit,
    route: "IV",
    at: "2026-10-16T08:15:00.000Z",
    by: { id: "p1", name: "Dr. Chen", initials: "RC" },
  };
}

describe("aims/dose-limits (US-F-08 Sedation Safety Alerts)", () => {
  it("emits no warnings when cumulative doses remain below thresholds", () => {
    const doses: DrugDose[] = [
      createMockDose("midazolam", 2, "mg"),
      createMockDose("fentanyl", 50, "mcg"),
      createMockDose("propofol", 100, "mg"),
    ];

    const warnings = evaluateCumulativeDoses(doses);
    expect(warnings).toEqual([]);
  });

  it("emits advisory warning when cumulative fentanyl reaches or exceeds 200 mcg", () => {
    const doses: DrugDose[] = [
      createMockDose("fentanyl", 100, "mcg"),
      createMockDose("fentanyl", 100, "mcg"),
    ];

    const warnings = evaluateCumulativeDoses(doses);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.drug).toBe("fentanyl");
    expect(warnings[0]?.totalDose).toBe(200);
    expect(warnings[0]?.warnThreshold).toBe(200);
    expect(warnings[0]?.message).toContain("Cumulative fentanyl dose (200 mcg)");
  });

  it("emits advisory warning when cumulative midazolam reaches or exceeds 5 mg", () => {
    const doses: DrugDose[] = [
      createMockDose("midazolam", 3, "mg"),
      createMockDose("midazolam", 3, "mg"),
    ];

    const warnings = evaluateCumulativeDoses(doses);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.drug).toBe("midazolam");
    expect(warnings[0]?.totalDose).toBe(6);
  });

  it("emits advisory warning when cumulative propofol reaches or exceeds 300 mg", () => {
    const doses: DrugDose[] = [
      createMockDose("propofol", 150, "mg"),
      createMockDose("propofol", 160, "mg"),
    ];

    const warnings = evaluateCumulativeDoses(doses);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.drug).toBe("propofol");
    expect(warnings[0]?.totalDose).toBe(310);
  });
});
