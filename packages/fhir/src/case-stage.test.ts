import { describe, expect, it } from "vitest";
import {
  buildCaseStageCodeSystem,
  caseStageCode,
  caseStageDefinition,
  caseStageDisplay,
  caseStageEncounterStatus,
  caseStageFromCode,
  ENCOUNTER_STATUS_BY_STAGE,
} from "./case-stage.js";
import { createFhirUrls } from "./urls.js";

const STAGES = [
  "requested",
  "scheduled",
  "confirmed",
  "arrived",
  "preop",
  "in_room",
  "procedure_start",
  "procedure_end",
  "pacu",
  "discharged",
  "cancelled",
  "no_show",
] as const;

describe("case stage codes", () => {
  it("gives each of the 12 stages a distinct lower-case kebab code that maps back", () => {
    const codes = STAGES.map(caseStageCode);
    expect(new Set(codes).size).toBe(STAGES.length);

    for (const stage of STAGES) {
      const code = caseStageCode(stage);
      expect(code).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(caseStageFromCode(code)).toBe(stage);
      expect(caseStageDisplay(stage).length).toBeGreaterThan(0);
      expect(caseStageDefinition(stage).length).toBeGreaterThan(0);
    }
  });

  it("resolves underscore and legacy alternative codes correctly", () => {
    expect(caseStageFromCode("in_room")).toBe("in_room");
    expect(caseStageFromCode("procedure_start")).toBe("procedure_start");
    expect(caseStageFromCode("procedure_end")).toBe("procedure_end");
    expect(caseStageFromCode("no_show")).toBe("no_show");
    expect(caseStageFromCode("pre-op")).toBe("preop");
  });

  it("returns undefined for unknown or unwritten codes", () => {
    for (const code of ["", "unknown", "PREOP", "constructor", "__proto__", "toString"]) {
      expect(caseStageFromCode(code)).toBeUndefined();
    }
  });

  it("maps every stage to a valid standard FHIR Encounter status", () => {
    expect(Object.keys(ENCOUNTER_STATUS_BY_STAGE)).toHaveLength(12);
    expect(caseStageEncounterStatus("requested")).toBe("planned");
    expect(caseStageEncounterStatus("scheduled")).toBe("planned");
    expect(caseStageEncounterStatus("confirmed")).toBe("planned");
    expect(caseStageEncounterStatus("arrived")).toBe("arrived");
    expect(caseStageEncounterStatus("preop")).toBe("in-progress");
    expect(caseStageEncounterStatus("in_room")).toBe("in-progress");
    expect(caseStageEncounterStatus("procedure_start")).toBe("in-progress");
    expect(caseStageEncounterStatus("procedure_end")).toBe("in-progress");
    expect(caseStageEncounterStatus("pacu")).toBe("in-progress");
    expect(caseStageEncounterStatus("discharged")).toBe("finished");
    expect(caseStageEncounterStatus("cancelled")).toBe("cancelled");
    expect(caseStageEncounterStatus("no_show")).toBe("cancelled");
  });
});

describe("CaseStage CodeSystem", () => {
  it("builds the Medplum CodeSystem resource with 12 concepts", () => {
    const system = buildCaseStageCodeSystem();
    expect(system).toMatchObject({
      resourceType: "CodeSystem",
      url: "https://fhir.wybit.io/asc/CodeSystem/case-stage",
      name: "CaseStage",
      title: "Case stage",
      status: "active",
      content: "complete",
    });
    expect(system.concept?.map((c) => c.code)).toEqual(STAGES.map(caseStageCode));
    expect(system.concept?.every((c) => (c.display ?? "").length > 0 && (c.definition ?? "").length > 0)).toBe(true);
  });

  it("respects a custom canonical URL base", () => {
    const urls = createFhirUrls("https://fhir.custom.org/asc/");
    const system = buildCaseStageCodeSystem(urls);
    expect(system.url).toBe("https://fhir.custom.org/asc/CodeSystem/case-stage");
  });
});
