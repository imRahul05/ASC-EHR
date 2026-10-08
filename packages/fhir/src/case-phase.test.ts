import { describe, expect, it } from "vitest";

import { buildCasePhaseCodeSystem, buildProcedureIntentCodeSystem, casePhaseCode, casePhaseFromCode, isProcedureIntent } from "./case-phase.js";
import { createFhirUrls } from "./urls.js";

// Spelled out on purpose: a phase added to @asc/types fails the type check of the mapping, and this list
// makes the same drift visible in the tests (docs/product/04 §4.2).
const PHASES = [
  "SCHEDULED",
  "CONFIRMED",
  "ARRIVED",
  "PRE_OP",
  "READY_FOR_PROCEDURE",
  "IN_PROCEDURE",
  "RECOVERY",
  "READY_FOR_DISCHARGE",
  "DISCHARGED",
  "CHART_COMPLETE",
  "CODED",
  "EXPORTED",
  "CLOSED",
  "CANCELLED",
  "NO_SHOW",
] as const;

describe("case phase codes", () => {
  it("gives each phase a distinct lower-case code that maps back to it", () => {
    const codes = PHASES.map(casePhaseCode);
    expect(new Set(codes).size).toBe(PHASES.length);
    for (const phase of PHASES) {
      expect(casePhaseCode(phase)).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(casePhaseFromCode(casePhaseCode(phase))).toBe(phase);
    }
  });

  it("returns nothing for a code we did not write, including object property names", () => {
    for (const code of ["", "SCHEDULED", "Scheduled", "unknown", "constructor", "__proto__", "toString"]) {
      expect(casePhaseFromCode(code)).toBeUndefined();
    }
  });

  it("recognises exactly the procedure intents", () => {
    for (const intent of ["screening", "surveillance", "diagnostic"]) expect(isProcedureIntent(intent)).toBe(true);
    for (const other of ["", "Screening", "constructor", "toString", "__proto__"]) expect(isProcedureIntent(other)).toBe(false);
  });
});

describe("CodeSystems", () => {
  it("lists every phase once, in order, under the canonical base", () => {
    const system = buildCasePhaseCodeSystem();
    expect(system).toMatchObject({ resourceType: "CodeSystem", url: "https://fhir.wybit.io/asc/CodeSystem/case-phase", status: "active", content: "complete" });
    expect(system.concept?.map((concept) => concept.code)).toEqual(PHASES.map(casePhaseCode));
    expect(system.concept?.every((concept) => (concept.display ?? "").length > 0)).toBe(true);
  });

  it("describes the three procedure intents", () => {
    const system = buildProcedureIntentCodeSystem();
    expect(system.url).toBe("https://fhir.wybit.io/asc/CodeSystem/procedure-intent");
    expect(system.concept?.map((concept) => concept.code)).toEqual(["screening", "surveillance", "diagnostic"]);
  });

  it("follows a different base", () => {
    expect(buildCasePhaseCodeSystem(createFhirUrls("https://fhir.example.test/x/")).url).toBe("https://fhir.example.test/x/CodeSystem/case-phase");
  });
});
