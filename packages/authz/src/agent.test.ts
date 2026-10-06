import { describe, expect, it } from "vitest";
import { deriveAgentPrincipal } from "./agent";
import { can } from "./can";
import { facilityGrant, staffPrincipal } from "./fixtures";

const caller = staffPrincipal([
  facilityGrant("A", ["rn"], ["case.read", "note.draft", "ai.generate"]),
  facilityGrant("B", ["gi-physician"], ["case.read", "note.draft", "note.sign"]),
]);

const agent = deriveAgentPrincipal(caller, {
  agentId: "procedure-note",
  executionId: "exec-1",
  allowList: ["note.draft", "case.read", "note.sign"],
  patientId: "patient-1",
  caseId: "case-1",
});
const inRun = { patientId: "patient-1", caseId: "case-1" };

describe("agent principal", () => {
  it("has capabilities = caller's ∩ agent allow-list, per facility", () => {
    expect(can(agent, "note.draft", { facilityId: "A", ...inRun })).toBe(true);
    expect(can(agent, "ai.generate", { facilityId: "A", ...inRun })).toBe(false);
    // allow-listed but not held by the caller at A
    expect(can(agent, "note.sign", { facilityId: "A", ...inRun })).toBe(false);
    expect(can(agent, "note.sign", { facilityId: "B", ...inRun })).toBe(true);
  });

  it("records who it acts for and never exceeds the caller", () => {
    expect(agent.onBehalfOf).toBe(caller.id);
    expect(can(agent, "patient.merge", { facilityId: "A", ...inRun })).toBe(false);
  });

  it("is denied outside the run's patient or case", () => {
    expect(can(agent, "note.draft", { facilityId: "A", patientId: "patient-2", caseId: "case-1" })).toBe(false);
    expect(can(agent, "note.draft", { facilityId: "A", patientId: "patient-1", caseId: "case-2" })).toBe(false);
    expect(can(agent, "note.draft", { facilityId: "A", patientId: "patient-1" })).toBe(false);
    expect(can(agent, "note.draft", { facilityId: "A" })).toBe(false);
  });

  it("drops grants with no remaining capability", () => {
    const narrow = deriveAgentPrincipal(caller, {
      agentId: "x",
      executionId: "e",
      allowList: ["ai.generate"],
      patientId: "patient-1",
    });
    expect(narrow.grants).toHaveLength(1);
    expect(can(narrow, "ai.generate", { facilityId: "A", patientId: "patient-1" })).toBe(true);
  });
});
