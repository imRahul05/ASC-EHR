import { describe, expect, it } from "vitest";

import { createFhirUrls } from "../urls.js";
import { buildTask } from "./task.js";

const base = { facilityId: "fac-1", type: "sign-note" } as const;

describe("buildTask", () => {
  it("is an open worklist item of one facility", () => {
    expect(buildTask(base)).toEqual({
      resourceType: "Task",
      meta: { account: { reference: "Organization/fac-1" } },
      status: "requested",
      intent: "order",
      code: { coding: [{ system: "https://fhir.wybit.io/asc/CodeSystem/task-type", code: "sign-note" }] },
    });
  });

  it("links the patient and case, and is accepted once it has an owner", () => {
    const task = buildTask({ ...base, patientId: "pat-1", encounterId: "enc-1", ownerId: "doc-1", description: "Sign the procedure note" });
    expect(task).toMatchObject({
      status: "accepted",
      for: { reference: "Patient/pat-1" },
      focus: { reference: "Encounter/enc-1" },
      owner: { reference: "Practitioner/doc-1" },
      description: "Sign the procedure note",
    });
  });

  it("carries when it was created and when it is due", () => {
    const task = buildTask({ ...base, authoredOn: "2026-10-08T09:00:00Z", dueBy: "2026-10-09T09:00:00Z" });
    expect(task.authoredOn).toBe("2026-10-08T09:00:00Z");
    expect(task.restriction).toEqual({ period: { end: "2026-10-09T09:00:00Z" } });
  });

  it("uses the base it is given for the task type system", () => {
    expect(buildTask(base, createFhirUrls("https://fhir.example.test/x/")).code?.coding?.[0]?.system).toBe("https://fhir.example.test/x/CodeSystem/task-type");
  });

  it("rejects a type that is not a canonical name, bad ids and times", () => {
    expect(() => buildTask({ ...base, type: "Sign Note" })).toThrow("invalid canonical name");
    expect(() => buildTask({ ...base, patientId: "" })).toThrow("invalid patient id");
    expect(() => buildTask({ ...base, encounterId: "a b" })).toThrow("invalid encounter id");
    expect(() => buildTask({ ...base, ownerId: "x/y" })).toThrow("invalid owner id");
    expect(() => buildTask({ ...base, description: "" })).toThrow("invalid task description");
    expect(() => buildTask({ ...base, authoredOn: "now" })).toThrow("invalid task authored time");
    expect(() => buildTask({ ...base, dueBy: "soon" })).toThrow("invalid task due time");
    expect(() => buildTask({ ...base, facilityId: "" })).toThrow("invalid facility id");
  });
});
