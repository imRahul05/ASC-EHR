/**
 * FHIR Task Builder & WorkItem Mapper Unit Tests
 *
 * Enforces 100% test coverage across lines, branches, and functions (P03/P12 acceptance).
 *
 * Regulatory Citations:
 * - CMS 42 CFR § 416.52: Conditions for Coverage - Patient assessment & H&P validity.
 * - No Surprises Act 45 CFR § 149.610: Good Faith Estimates delivery.
 * - HIPAA 45 CFR § 164.312(b): Audit controls, technical access, and capability tracking.
 */

import { describe, expect, it } from "vitest";
import type { Task } from "@medplum/fhirtypes";
import { WORK_ITEM_TYPES } from "@asc/types";
import { createFhirUrls } from "../urls.js";
import { buildTask, mapTaskToWorkItem } from "./task.js";

const base = { facilityId: "fac-1", type: "sign-note" } as const;

describe("buildTask", () => {
  it("is an open worklist item of one facility", () => {
    expect(buildTask(base)).toEqual({
      resourceType: "Task",
      meta: { accounts: [{ reference: "Organization/fac-1" }] },
      status: "requested",
      intent: "order",
      code: { coding: [{ system: "https://fhir.wybit.io/asc/CodeSystem/task-type", code: "sign-note" }] },
    });
  });

  it("links the patient and case, and is accepted once it has an owner", () => {
    const task = buildTask({
      ...base,
      patientId: "pat-1",
      encounterId: "enc-1",
      ownerId: "doc-1",
      description: "Sign the procedure note",
    });
    expect(task).toMatchObject({
      status: "accepted",
      for: { reference: "Patient/pat-1" },
      focus: { reference: "Encounter/enc-1" },
      owner: { reference: "Practitioner/doc-1" },
      description: "Sign the procedure note",
    });
  });

  it("carries when it was created, when it is due, and optional priority", () => {
    const task = buildTask({
      ...base,
      priority: "routine",
      authoredOn: "2026-10-08T09:00:00Z",
      dueBy: "2026-10-09T09:00:00Z",
    });
    expect(task.priority).toBe("routine");
    expect(task.authoredOn).toBe("2026-10-08T09:00:00Z");
    expect(task.restriction).toEqual({ period: { end: "2026-10-09T09:00:00Z" } });
  });

  it("uses the base it is given for the task type system", () => {
    expect(
      buildTask(base, createFhirUrls("https://fhir.example.test/x/")).code?.coding?.[0]?.system,
    ).toBe("https://fhir.example.test/x/CodeSystem/task-type");
  });

  it("supports caseId and dueAt aliases, and detail/title description fallback", () => {
    const task1 = buildTask({
      facilityId: "fac-1",
      type: "hp_expiring",
      caseId: "case-99",
      dueAt: "2026-10-10T12:00:00Z",
      detail: "H&P expires in 24 hours",
    });
    expect(task1.focus).toEqual({ reference: "Encounter/case-99" });
    expect(task1.restriction).toEqual({ period: { end: "2026-10-10T12:00:00Z" } });
    expect(task1.description).toBe("H&P expires in 24 hours");

    const task2 = buildTask({
      facilityId: "fac-1",
      type: "prep_reminder",
      title: "Send bowel prep reminder",
    });
    expect(task2.description).toBe("Send bowel prep reminder");
  });

  it("embeds extensions, idempotency identifier, referral basedOn, and completion metadata", () => {
    const task = buildTask({
      facilityId: "fac-1",
      type: "med_hold_review",
      title: "Review Eliquis hold protocol",
      detail: "Hold Eliquis 48h prior to colonoscopy polypectomy",
      ownerCapability: "medhold.review",
      ownerRole: "NURSE",
      ownerId: "nurse-42",
      timelineMilestone: "T-3d",
      agentName: "medHoldAdvisorAgent",
      abstentionReason: "High-risk dabigatran renal clearance requires physician review",
      createdByAgent: true,
      idempotencyKey: "case-timeline:c1:T-3d:med_hold_review",
      referralId: "ref-101",
      completedAt: "2026-10-12T14:30:00Z",
      resolvedBy: "dr-jones",
      resolution: "Cleared for procedure under standard 48h hold protocol",
    });

    expect(task.status).toBe("completed");
    expect(task.identifier).toEqual([
      {
        system: "https://fhir.wybit.io/asc/identifier/work-item-idempotency-key",
        value: "case-timeline:c1:T-3d:med_hold_review",
      },
    ]);
    expect(task.basedOn).toEqual([{ reference: "ServiceRequest/ref-101" }]);
    expect(task.executionPeriod).toEqual({ end: "2026-10-12T14:30:00Z" });
    expect(task.output).toEqual([{ type: { text: "resolution" }, valueString: "Cleared for procedure under standard 48h hold protocol" }]);

    expect(task.extension).toContainEqual({
      url: "https://fhir.wybit.io/asc/StructureDefinition/task-title",
      valueString: "Review Eliquis hold protocol",
    });
    expect(task.extension).toContainEqual({
      url: "https://fhir.wybit.io/asc/StructureDefinition/task-owner-capability",
      valueString: "medhold.review",
    });
    expect(task.extension).toContainEqual({
      url: "https://fhir.wybit.io/asc/StructureDefinition/task-owner-role",
      valueString: "NURSE",
    });
    expect(task.extension).toContainEqual({
      url: "https://fhir.wybit.io/asc/StructureDefinition/task-timeline-milestone",
      valueString: "T-3d",
    });
    expect(task.extension).toContainEqual({
      url: "https://fhir.wybit.io/asc/StructureDefinition/task-agent-name",
      valueString: "medHoldAdvisorAgent",
    });
    expect(task.extension).toContainEqual({
      url: "https://fhir.wybit.io/asc/StructureDefinition/task-abstention-reason",
      valueString: "High-risk dabigatran renal clearance requires physician review",
    });
    expect(task.extension).toContainEqual({
      url: "https://fhir.wybit.io/asc/StructureDefinition/task-created-by-agent",
      valueBoolean: true,
    });
    expect(task.extension).toContainEqual({
      url: "https://fhir.wybit.io/asc/StructureDefinition/task-resolved-by",
      valueString: "dr-jones",
    });
    expect(task.extension).toContainEqual({
      url: "https://fhir.wybit.io/asc/StructureDefinition/task-resolution",
      valueString: "Cleared for procedure under standard 48h hold protocol",
    });
  });

  it("respects explicit status over default ownerId / completedAt logic", () => {
    const task = buildTask({
      facilityId: "fac-1",
      type: "coding",
      status: "in-progress",
      ownerId: "coder-1",
    });
    expect(task.status).toBe("in-progress");
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

describe("mapTaskToWorkItem", () => {
  it("maps all 19 WorkItemTypes round-trip through buildTask and mapTaskToWorkItem", () => {
    const nowIso = "2026-10-15T12:00:00.000Z";

    for (const itemType of WORK_ITEM_TYPES) {
      const task = buildTask({
        facilityId: "fac-1",
        type: itemType,
        title: `Task for ${itemType}`,
        detail: `Detailed notes for ${itemType}`,
        authoredOn: nowIso,
        dueAt: "2026-10-16T12:00:00.000Z",
      });
      task.id = `task-${itemType}`;

      const workItem = mapTaskToWorkItem(task, nowIso);
      expect(workItem.type).toBe(itemType);
      expect(workItem.title).toBe(`Task for ${itemType}`);
      expect(workItem.detail).toBe(`Detailed notes for ${itemType}`);
      expect(workItem.status).toBe("open");
      expect(workItem.priority).toBe("routine");
      expect(workItem.isOverdue).toBe(false);
    }
  });

  it("maps status values correctly (open, claimed, completed)", () => {
    const nowIso = "2026-10-15T12:00:00.000Z";

    const openTask: Task = {
      resourceType: "Task",
      id: "t1",
      status: "requested",
      intent: "order",
    };
    expect(mapTaskToWorkItem(openTask, nowIso).status).toBe("open");

    const acceptedTask: Task = {
      resourceType: "Task",
      id: "t2",
      status: "accepted",
      intent: "order",
    };
    expect(mapTaskToWorkItem(acceptedTask, nowIso).status).toBe("claimed");

    const inProgressTask: Task = {
      resourceType: "Task",
      id: "t3",
      status: "in-progress",
      intent: "order",
    };
    expect(mapTaskToWorkItem(inProgressTask, nowIso).status).toBe("claimed");

    const completedTask: Task = {
      resourceType: "Task",
      id: "t4",
      status: "completed",
      intent: "order",
    };
    expect(mapTaskToWorkItem(completedTask, nowIso).status).toBe("completed");
  });

  it("maps priority values correctly (stat, urgent, routine)", () => {
    const nowIso = "2026-10-15T12:00:00.000Z";

    const statTask: Task = { resourceType: "Task", id: "t1", status: "requested", intent: "order", priority: "stat" };
    expect(mapTaskToWorkItem(statTask, nowIso).priority).toBe("stat");

    const urgentTask: Task = { resourceType: "Task", id: "t2", status: "requested", intent: "order", priority: "urgent" };
    expect(mapTaskToWorkItem(urgentTask, nowIso).priority).toBe("urgent");

    const asapTask: Task = { resourceType: "Task", id: "t3", status: "requested", intent: "order", priority: "asap" };
    expect(mapTaskToWorkItem(asapTask, nowIso).priority).toBe("urgent");

    const routineTask: Task = { resourceType: "Task", id: "t4", status: "requested", intent: "order", priority: "routine" };
    expect(mapTaskToWorkItem(routineTask, nowIso).priority).toBe("routine");
  });

  it("calculates overdue correctly based on status and reference timestamp", () => {
    const now = "2026-10-15T12:00:00.000Z";
    const past = "2026-10-14T12:00:00.000Z";
    const future = "2026-10-16T12:00:00.000Z";

    const overdueOpen: Task = {
      resourceType: "Task",
      id: "t1",
      status: "requested",
      intent: "order",
      restriction: { period: { end: past } },
    };
    expect(mapTaskToWorkItem(overdueOpen, now).isOverdue).toBe(true);

    const pendingOpen: Task = {
      resourceType: "Task",
      id: "t2",
      status: "requested",
      intent: "order",
      restriction: { period: { end: future } },
    };
    expect(mapTaskToWorkItem(pendingOpen, now).isOverdue).toBe(false);

    const completedPast: Task = {
      resourceType: "Task",
      id: "t3",
      status: "completed",
      intent: "order",
      restriction: { period: { end: past } },
    };
    expect(mapTaskToWorkItem(completedPast, now).isOverdue).toBe(false);
  });

  it("extracts all domain extensions and reference ids cleanly", () => {
    const urls = createFhirUrls();
    const task: Task = {
      resourceType: "Task",
      id: "task-complex-1",
      status: "completed",
      intent: "order",
      code: {
        coding: [
          { system: urls.codeSystem("task-type"), code: "anesthesia-review" },
        ],
      },
      for: { reference: "Patient/pat-55" },
      focus: { reference: "Encounter/case-77" },
      owner: { reference: "Practitioner/dr-smith" },
      basedOn: [{ reference: "ServiceRequest/ref-88" }],
      authoredOn: "2026-10-10T08:00:00Z",
      restriction: { period: { end: "2026-10-11T08:00:00Z" } },
      executionPeriod: { end: "2026-10-10T11:30:00Z" },
      output: [{ type: { text: "resolution" }, valueString: "Mallampati class II cleared" }],
      extension: [
        { url: urls.structureDefinition("task-title"), valueString: "Anesthesia Airway Evaluation" },
        { url: urls.structureDefinition("task-owner-capability"), valueString: "anesthesia.document" },
        { url: urls.structureDefinition("task-owner-role"), valueString: "ANESTHESIOLOGIST" },
        { url: urls.structureDefinition("task-timeline-milestone"), valueString: "T-3d" },
        { url: urls.structureDefinition("task-agent-name"), valueString: "preopReadinessAgent" },
        { url: urls.structureDefinition("task-abstention-reason"), valueString: "OSA history requires physician signoff" },
        { url: urls.structureDefinition("task-created-by-agent"), valueBoolean: true },
        { url: urls.structureDefinition("task-resolved-by"), valueString: "dr-smith" },
        { url: urls.structureDefinition("task-resolution"), valueString: "Mallampati class II cleared" },
      ],
    };

    const workItem = mapTaskToWorkItem(task, "2026-10-10T12:00:00Z");
    expect(workItem.id).toBe("task-complex-1");
    expect(workItem.type).toBe("anesthesia_review");
    expect(workItem.title).toBe("Anesthesia Airway Evaluation");
    expect(workItem.ownerCapability).toBe("anesthesia.document");
    expect(workItem.ownerRole).toBe("ANESTHESIOLOGIST");
    expect(workItem.ownerId).toBe("dr-smith");
    expect(workItem.caseId).toBe("case-77");
    expect(workItem.patientId).toBe("pat-55");
    expect(workItem.referralId).toBe("ref-88");
    expect(workItem.timelineMilestone).toBe("T-3d");
    expect(workItem.agentName).toBe("preopReadinessAgent");
    expect(workItem.abstentionReason).toBe("OSA history requires physician signoff");
    expect(workItem.createdByAgent).toBe(true);
    expect(workItem.completedAt).toBe("2026-10-10T11:30:00Z");
    expect(workItem.resolvedBy).toBe("dr-smith");
    expect(workItem.resolution).toBe("Mallampati class II cleared");
  });

  it("handles fallback to output valueString and unslashed references", () => {
    const task: Task = {
      resourceType: "Task",
      id: "task-fallback",
      status: "completed",
      intent: "order",
      code: {
        coding: [
          { system: "https://other.system/code", code: "prep-reminder" },
        ],
      },
      for: { reference: "pat-bare" },
      focus: { reference: "case-bare" },
      output: [{ type: { text: "resolution" }, valueString: "Output resolution without extension" }],
    };

    const workItem = mapTaskToWorkItem(task);
    expect(workItem.type).toBe("prep_reminder");
    expect(workItem.patientId).toBe("pat-bare");
    expect(workItem.caseId).toBe("case-bare");
    expect(workItem.resolution).toBe("Output resolution without extension");
  });

  it("handles bare task without id, without extensions, and without description", () => {
    const bareTask: Task = {
      resourceType: "Task",
      status: "requested",
      intent: "order",
      code: {
        coding: [{ code: "hp-expiring" }],
      },
    };
    const workItem = mapTaskToWorkItem(bareTask, "2026-10-15T12:00:00.000Z");
    expect(workItem.id).toBe("");
    expect(workItem.type).toBe("hp_expiring");
    expect(workItem.title).toBe("hp expiring");
    expect(workItem.detail).toBe("");
  });
});
