import { describe, expect, it } from "vitest";

import {
  agentExecutionIdExtension,
  casePhaseExtension,
  extensionUrls,
  procedureIntentExtension,
  readAgentExecutionId,
  readCasePhase,
  readProcedureIntent,
} from "./extensions.js";
import { createFhirUrls } from "./urls.js";

const other = createFhirUrls("https://fhir.example.test/x/");

describe("extension urls", () => {
  it("are StructureDefinitions under the canonical base", () => {
    expect(extensionUrls).toEqual({
      casePhase: "https://fhir.wybit.io/asc/StructureDefinition/case-phase",
      procedureIntent: "https://fhir.wybit.io/asc/StructureDefinition/procedure-intent",
      agentExecutionId: "https://fhir.wybit.io/asc/StructureDefinition/agent-execution-id",
    });
  });
});

describe("case phase extension", () => {
  it("writes a coding in our CodeSystem and reads it back", () => {
    const extension = casePhaseExtension("READY_FOR_PROCEDURE");
    expect(extension).toEqual({
      url: "https://fhir.wybit.io/asc/StructureDefinition/case-phase",
      valueCoding: { system: "https://fhir.wybit.io/asc/CodeSystem/case-phase", code: "ready-for-procedure" },
    });
    expect(readCasePhase([extension])).toBe("READY_FOR_PROCEDURE");
  });

  it("finds it among other extensions and ignores a foreign system, a foreign code and a missing list", () => {
    expect(readCasePhase([{ url: "urn:other", valueString: "x" }, casePhaseExtension("CLOSED")])).toBe("CLOSED");
    expect(readCasePhase([{ url: extensionUrls.casePhase, valueCoding: { system: "urn:other", code: "closed" } }])).toBeUndefined();
    expect(readCasePhase([{ url: extensionUrls.casePhase, valueCoding: { system: "https://fhir.wybit.io/asc/CodeSystem/case-phase", code: "nope" } }])).toBeUndefined();
    expect(readCasePhase([{ url: extensionUrls.casePhase }])).toBeUndefined();
    expect(readCasePhase(undefined)).toBeUndefined();
    expect(readCasePhase([])).toBeUndefined();
  });

  it("uses the base it is given for the url and the system, and only reads its own", () => {
    const extension = casePhaseExtension("ARRIVED", other);
    expect(extension.url).toBe("https://fhir.example.test/x/StructureDefinition/case-phase");
    expect(extension.valueCoding?.system).toBe("https://fhir.example.test/x/CodeSystem/case-phase");
    expect(readCasePhase([extension], other)).toBe("ARRIVED");
    expect(readCasePhase([extension])).toBeUndefined();
  });
});

describe("procedure intent extension", () => {
  it("round-trips each intent and rejects a foreign value", () => {
    for (const intent of ["screening", "surveillance", "diagnostic"] as const) {
      expect(readProcedureIntent([procedureIntentExtension(intent)])).toBe(intent);
    }
    expect(readProcedureIntent([{ url: extensionUrls.procedureIntent, valueCoding: { system: "https://fhir.wybit.io/asc/CodeSystem/procedure-intent", code: "constructor" } }])).toBeUndefined();
    expect(readProcedureIntent(undefined)).toBeUndefined();
  });
});

describe("agent execution id extension", () => {
  it("carries an opaque id and reads it back", () => {
    const extension = agentExecutionIdExtension("run_01-AB");
    expect(extension).toEqual({ url: "https://fhir.wybit.io/asc/StructureDefinition/agent-execution-id", valueString: "run_01-AB" });
    expect(readAgentExecutionId([extension])).toBe("run_01-AB");
    expect(readAgentExecutionId([])).toBeUndefined();
  });

  it.each(["", "has space", "a/b", "x".repeat(65), "text with a name"])("rejects %j: it must be an opaque id, never content", (id) => {
    expect(() => agentExecutionIdExtension(id)).toThrow("invalid agent execution id");
  });
});
