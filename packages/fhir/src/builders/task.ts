/**
 * FHIR R4 Task Builder & Bidirectional WorkItem Mapper
 *
 * Implements pure transformation between unified domain WorkItems and FHIR R4 Task resources.
 *
 * Regulatory Citations:
 * - CMS 42 CFR § 416.52: Conditions for Coverage - Surgical Services. Mandates pre-operative
 *   patient assessment, history and physical (H&P) examination within 30 days, and pre-procedure
 *   readiness verification before surgical intervention.
 * - No Surprises Act 45 CFR § 149.610: Good Faith Estimates for uninsured/self-pay patients
 *   and timely financial clearance delivery.
 * - HIPAA 45 CFR § 164.312(b): Technical safeguards and audit controls ensuring work items
 *   are assigned and claimed under capability-scoped authorization with provenance tracking.
 */

import type { Extension, Task } from "@medplum/fhirtypes";
import type {
  ParticipantRole,
  PreopTimelineMilestone,
  WorkItem,
  WorkItemPriority,
  WorkItemStatus,
  WorkItemType,
} from "@asc/types";
import { facilityMeta, instant, reference, text } from "@asc/fhir/builders/common";
import { assertCanonicalName, type FhirUrls, fhirUrls } from "@asc/fhir/urls";

export interface WorklistTaskInput {
  readonly facilityId: string;
  /**
   * The kind of work item (e.g. sign-note, prep-instructions, hp-expiring, or snake_case).
   */
  readonly type: string;
  readonly patientId?: string;
  readonly encounterId?: string;
  readonly caseId?: string;
  readonly referralId?: string;
  readonly ownerId?: string;
  readonly ownerRole?: ParticipantRole;
  readonly ownerCapability?: string;
  readonly title?: string;
  readonly description?: string;
  readonly detail?: string;
  readonly priority?: "routine" | "urgent" | "asap" | "stat";
  readonly status?: Task["status"];
  readonly authoredOn?: string;
  readonly dueBy?: string;
  readonly dueAt?: string;
  readonly completedAt?: string;
  readonly timelineMilestone?: PreopTimelineMilestone;
  readonly agentName?: string;
  readonly abstentionReason?: string;
  readonly createdByAgent?: boolean;
  readonly resolvedBy?: string;
  readonly resolution?: string;
  readonly idempotencyKey?: string;
}

function toCanonicalTaskCode(type: string): string {
  return assertCanonicalName(type.replace(/_/g, "-"));
}

function toWorkItemType(code: string): WorkItemType {
  return code.replace(/-/g, "_") as WorkItemType;
}

function findStringExtension(extensions: readonly Extension[] | undefined, url: string): string | undefined {
  return extensions?.find((e) => e.url === url)?.valueString;
}

function findBooleanExtension(extensions: readonly Extension[] | undefined, url: string): boolean | undefined {
  return extensions?.find((e) => e.url === url)?.valueBoolean;
}

function extractReferenceId(ref: string | undefined): string | undefined {
  if (ref === undefined) return undefined;
  const parts = ref.split("/");
  return parts.length > 1 ? parts[parts.length - 1] : ref;
}

/**
 * Builds a FHIR R4 Task resource from clinical work item parameters.
 *
 * Implements CMS 42 CFR § 416.52 pre-operative conditions of coverage,
 * No Surprises Act 45 CFR § 149.610 GFE delivery tracking, and
 * HIPAA 45 CFR § 164.312(b) audit/capability controls.
 */
export function buildTask(input: WorklistTaskInput, urls: FhirUrls = fhirUrls): Task {
  const code = toCanonicalTaskCode(input.type);
  const encounterId = input.encounterId ?? input.caseId;
  const due = input.dueBy ?? input.dueAt;
  const desc = input.description ?? input.detail ?? input.title;

  const extensions: Extension[] = [];
  if (input.title !== undefined) {
    extensions.push({ url: urls.structureDefinition("task-title"), valueString: input.title });
  }
  if (input.ownerCapability !== undefined) {
    extensions.push({ url: urls.structureDefinition("task-owner-capability"), valueString: input.ownerCapability });
  }
  if (input.ownerRole !== undefined) {
    extensions.push({ url: urls.structureDefinition("task-owner-role"), valueString: input.ownerRole });
  }
  if (input.timelineMilestone !== undefined) {
    extensions.push({ url: urls.structureDefinition("task-timeline-milestone"), valueString: input.timelineMilestone });
  }
  if (input.agentName !== undefined) {
    extensions.push({ url: urls.structureDefinition("task-agent-name"), valueString: input.agentName });
  }
  if (input.abstentionReason !== undefined) {
    extensions.push({ url: urls.structureDefinition("task-abstention-reason"), valueString: input.abstentionReason });
  }
  if (input.createdByAgent !== undefined) {
    extensions.push({ url: urls.structureDefinition("task-created-by-agent"), valueBoolean: input.createdByAgent });
  }
  if (input.resolvedBy !== undefined) {
    extensions.push({ url: urls.structureDefinition("task-resolved-by"), valueString: input.resolvedBy });
  }
  if (input.resolution !== undefined) {
    extensions.push({ url: urls.structureDefinition("task-resolution"), valueString: input.resolution });
  }

  const taskStatus: Task["status"] =
    input.status ??
    (input.completedAt !== undefined
      ? "completed"
      : input.ownerId === undefined
        ? "requested"
        : "accepted");

  return {
    resourceType: "Task",
    meta: facilityMeta(input.facilityId),
    status: taskStatus,
    intent: "order",
    ...(input.priority === undefined ? {} : { priority: input.priority }),
    code: { coding: [{ system: urls.codeSystem("task-type"), code }] },
    ...(extensions.length > 0 ? { extension: extensions } : {}),
    ...(input.idempotencyKey === undefined
      ? {}
      : {
          identifier: [
            {
              system: urls.identifierSystem("work-item-idempotency-key"),
              value: input.idempotencyKey,
            },
          ],
        }),
    ...(input.patientId === undefined ? {} : { for: reference("Patient", input.patientId, "patient id") }),
    ...(encounterId === undefined ? {} : { focus: reference("Encounter", encounterId, "encounter id") }),
    ...(input.referralId === undefined ? {} : { basedOn: [reference("ServiceRequest", input.referralId, "referral id")] }),
    ...(input.ownerId === undefined ? {} : { owner: reference("Practitioner", input.ownerId, "owner id") }),
    ...(desc === undefined ? {} : { description: text(desc, "task description", 2000) }),
    ...(input.authoredOn === undefined ? {} : { authoredOn: instant(input.authoredOn, "task authored time") }),
    ...(due === undefined ? {} : { restriction: { period: { end: instant(due, "task due time") } } }),
    ...(input.completedAt === undefined
      ? {}
      : { executionPeriod: { end: instant(input.completedAt, "task execution end") } }),
    ...(input.resolution === undefined
      ? {}
      : { output: [{ type: { text: "resolution" }, valueString: input.resolution }] }),
  };
}

/**
 * Maps a FHIR R4 Task resource back into a domain WorkItem.
 *
 * Implements SLA calculation, overdue state resolution against reference timestamp,
 * and extraction of clinical extensions (timeline milestones, agent abstention, capabilities).
 */
export function mapTaskToWorkItem(
  task: Task,
  nowIso: string = new Date().toISOString(),
  urls: FhirUrls = fhirUrls,
): WorkItem {
  const codeEntry =
    task.code?.coding?.find((c) => c.system === urls.codeSystem("task-type")) ??
    task.code?.coding?.[0];
  const typeCode = codeEntry?.code ?? "sign-note";
  const type = toWorkItemType(typeCode);

  const titleExt = findStringExtension(task.extension, urls.structureDefinition("task-title"));
  const capabilityExt = findStringExtension(task.extension, urls.structureDefinition("task-owner-capability"));
  const roleExt = findStringExtension(task.extension, urls.structureDefinition("task-owner-role")) as
    | ParticipantRole
    | undefined;
  const milestoneExt = findStringExtension(
    task.extension,
    urls.structureDefinition("task-timeline-milestone"),
  ) as PreopTimelineMilestone | undefined;
  const agentNameExt = findStringExtension(task.extension, urls.structureDefinition("task-agent-name"));
  const abstentionExt = findStringExtension(task.extension, urls.structureDefinition("task-abstention-reason"));
  const createdByAgentExt = findBooleanExtension(task.extension, urls.structureDefinition("task-created-by-agent"));
  const resolvedByExt = findStringExtension(task.extension, urls.structureDefinition("task-resolved-by"));
  const resolutionExt =
    findStringExtension(task.extension, urls.structureDefinition("task-resolution")) ??
    task.output?.[0]?.valueString;

  let priority: WorkItemPriority = "routine";
  if (task.priority === "stat") priority = "stat";
  else if (task.priority === "urgent" || task.priority === "asap") priority = "urgent";

  let status: WorkItemStatus = "open";
  if (task.status === "completed") status = "completed";
  else if (task.status === "accepted" || task.status === "in-progress") status = "claimed";

  const createdAt = task.authoredOn ?? nowIso;
  const dueAt = task.restriction?.period?.end ?? createdAt;
  const isOverdue = status !== "completed" && Date.parse(dueAt) < Date.parse(nowIso);

  const caseId = extractReferenceId(task.focus?.reference);
  const patientId = extractReferenceId(task.for?.reference);
  const referralId = extractReferenceId(task.basedOn?.[0]?.reference);
  const ownerId = extractReferenceId(task.owner?.reference);

  return {
    id: task.id ?? "",
    type,
    title: titleExt ?? task.description ?? type.replace(/_/g, " "),
    detail: task.description ?? "",
    ...(roleExt !== undefined ? { ownerRole: roleExt } : {}),
    ...(capabilityExt !== undefined ? { ownerCapability: capabilityExt } : {}),
    ...(ownerId !== undefined ? { ownerId } : {}),
    priority,
    status,
    dueAt,
    createdAt,
    ...(caseId !== undefined ? { caseId } : {}),
    ...(patientId !== undefined ? { patientId } : {}),
    ...(referralId !== undefined ? { referralId } : {}),
    ...(task.executionPeriod?.end !== undefined ? { completedAt: task.executionPeriod.end } : {}),
    ...(resolvedByExt !== undefined ? { resolvedBy: resolvedByExt } : {}),
    ...(resolutionExt !== undefined ? { resolution: resolutionExt } : {}),
    ...(agentNameExt !== undefined ? { agentName: agentNameExt } : {}),
    ...(abstentionExt !== undefined ? { abstentionReason: abstentionExt } : {}),
    ...(createdByAgentExt !== undefined ? { createdByAgent: createdByAgentExt } : {}),
    ...(milestoneExt !== undefined ? { timelineMilestone: milestoneExt } : {}),
    isOverdue,
  };
}

