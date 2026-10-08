import { describe, expect, it } from "vitest";

import { readAgentExecutionId } from "../extensions.js";
import { createFhirUrls } from "../urls.js";
import { buildProvenance } from "./provenance.js";

const base = {
  facilityId: "fac-1",
  target: { type: "Composition", id: "note-1" },
  practitionerId: "doc-1",
  role: "attester",
  recorded: "2026-10-08T11:00:00Z",
} as const;

describe("buildProvenance", () => {
  it("records who acted on which resource and when", () => {
    expect(buildProvenance(base)).toEqual({
      resourceType: "Provenance",
      meta: { accounts: [{ reference: "Organization/fac-1" }] },
      target: [{ reference: "Composition/note-1" }],
      recorded: "2026-10-08T11:00:00Z",
      agent: [{ type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/provenance-participant-type", code: "attester" }] }, who: { reference: "Practitioner/doc-1" } }],
    });
  });

  it("carries the AI run id as an extension, only when given", () => {
    expect(buildProvenance(base)).not.toHaveProperty("extension");
    const provenance = buildProvenance({ ...base, role: "author", agentExecutionId: "run_01" });
    expect(readAgentExecutionId(provenance.extension)).toBe("run_01");
    expect(provenance.agent?.[0]?.type?.coding?.[0]?.code).toBe("author");
  });

  it("uses the base it is given for the extension", () => {
    const provenance = buildProvenance({ ...base, agentExecutionId: "run_01" }, createFhirUrls("https://fhir.example.test/x/"));
    expect(provenance.extension?.[0]?.url).toBe("https://fhir.example.test/x/StructureDefinition/agent-execution-id");
  });

  it("rejects bad ids, times and a run id that is not opaque", () => {
    expect(() => buildProvenance({ ...base, target: { type: "Composition", id: "" } })).toThrow("invalid provenance target id");
    expect(() => buildProvenance({ ...base, practitionerId: "a b" })).toThrow("invalid practitioner id");
    expect(() => buildProvenance({ ...base, recorded: "today" })).toThrow("invalid provenance time");
    expect(() => buildProvenance({ ...base, agentExecutionId: "free text" })).toThrow("invalid agent execution id");
    expect(() => buildProvenance({ ...base, facilityId: "" })).toThrow("invalid facility id");
  });
});
