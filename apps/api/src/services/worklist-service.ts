/**
 * FHIR Task Unified Worklist Engine Service
 *
 * Implements clinical and administrative task orchestration across preoperative,
 * intraoperative, and post-discharge workflows.
 *
 * Regulatory Citations:
 * - CMS 42 CFR § 416.52: Conditions for Coverage - Surgical Services. Mandates pre-operative
 *   patient assessment, history and physical (H&P) examination within 30 days, and pre-procedure
 *   readiness verification before surgical intervention.
 * - No Surprises Act 45 CFR § 149.610: Requirements for Good Faith Estimates (GFE) for
 *   uninsured and self-pay individuals within statutory advance notice windows.
 * - HIPAA 45 CFR § 164.312(b): Audit controls, technical access controls, and capability-scoped
 *   role validation for clinical work item execution and claiming.
 */

import { forFacility } from "@asc/api-client/server";
import { authorize } from "@asc/authz";
import { sortWorkItemsForQueue } from "@asc/clinical-rules/worklist/timeline";
import { reference } from "@asc/fhir/builders/common";
import { buildTask, mapTaskToWorkItem } from "@asc/fhir/builders/task";
import { fhirUrls } from "@asc/fhir/urls";
import {
  API_ERROR_CODES,
  createDomainError,
  type Capability,
  type Principal,
  type WorkItem,
} from "@asc/types";
import type {
  ClaimWorkItemInput,
  CompleteWorkItemInput,
  CreateWorkItemInput,
  WorklistQuery,
} from "@asc/validation";
import type { MedplumClient } from "@medplum/core";
import type { Extension, Task } from "@medplum/fhirtypes";
import type { FastifyBaseLogger } from "fastify";

interface WorklistResult {
  readonly items: readonly WorkItem[];
  readonly total: number;
}

interface GetWorklistParams {
  readonly medplum: MedplumClient;
  readonly facilityId: string;
  readonly query: WorklistQuery;
  readonly nowIso?: string;
  readonly logger?: FastifyBaseLogger;
}

interface CreateWorkItemParams {
  readonly medplum: MedplumClient;
  readonly facilityId: string;
  readonly input: CreateWorkItemInput;
  readonly logger?: FastifyBaseLogger;
}

interface ClaimWorkItemParams {
  readonly medplum: MedplumClient;
  readonly facilityId: string;
  readonly itemId: string;
  readonly input: ClaimWorkItemInput;
  readonly principal: Principal;
  readonly logger?: FastifyBaseLogger;
}

interface CompleteWorkItemParams {
  readonly medplum: MedplumClient;
  readonly facilityId: string;
  readonly itemId: string;
  readonly input: CompleteWorkItemInput;
  readonly principal: Principal;
  readonly logger?: FastifyBaseLogger;
}

/**
 * Retrieves and filters unified worklist items for a facility.
 */
export async function getWorklist(params: GetWorklistParams): Promise<WorklistResult> {
  const { medplum, facilityId, query, nowIso = new Date().toISOString() } = params;

  const searchParams: [string, string][] = [["_count", "100"]];

  if (query.ownerId) {
    searchParams.push(["owner", `Practitioner/${query.ownerId}`]);
  }
  if (query.patientId) {
    searchParams.push(["patient", `Patient/${query.patientId}`]);
  }
  if (query.caseId) {
    searchParams.push(["focus", `Encounter/${query.caseId}`]);
  }
  if (query.priority) {
    searchParams.push(["priority", query.priority]);
  }

  const tasks = await medplum.searchResources("Task", searchParams);

  // Enforce facility tenant boundary via meta.accounts
  const facilityAccountRef = `Organization/${facilityId}`;
  const facilityTasks = tasks.filter((task) =>
    task.meta?.accounts?.some((acc) => acc.reference === facilityAccountRef),
  );

  let workItems = facilityTasks.map((t) => mapTaskToWorkItem(t, nowIso));

  // In-memory filters for extensions, statuses, and domain types
  if (query.type) {
    workItems = workItems.filter((item) => item.type === query.type);
  }
  if (query.status === "open") {
    workItems = workItems.filter((item) => item.status === "open");
  } else if (query.status === "claimed") {
    workItems = workItems.filter((item) => item.status === "claimed");
  } else if (query.status === "completed" || query.status === "done") {
    workItems = workItems.filter((item) => item.status === "completed");
  }
  if (query.ownerCapability) {
    workItems = workItems.filter((item) => item.ownerCapability === query.ownerCapability);
  }
  if (query.timelineMilestone) {
    workItems = workItems.filter((item) => item.timelineMilestone === query.timelineMilestone);
  }
  if (query.overdueOnly) {
    workItems = workItems.filter((item) => item.isOverdue === true);
  }

  // Sort deterministically: stat -> overdue urgent -> urgent -> routine
  const sorted = sortWorkItemsForQueue(workItems);
  const total = sorted.length;
  const offset = query.offset ?? 0;
  const limit = query.limit ?? 50;
  const items = sorted.slice(offset, offset + limit);

  return { items, total };
}

/**
 * Creates a new work item as a FHIR Task with idempotency checking.
 */
export async function createWorkItem(params: CreateWorkItemParams): Promise<WorkItem> {
  const { medplum, facilityId, input, logger } = params;

  if (input.idempotencyKey) {
    const system = fhirUrls.identifierSystem("work-item-idempotency-key");
    const existing = await medplum.searchResources("Task", [
      ["identifier", `${system}|${input.idempotencyKey}`],
    ]);
    if (existing.length > 0 && existing[0]) {
      logger?.info({ idempotencyKey: input.idempotencyKey }, "Idempotent work item hit; returning existing task");
      return mapTaskToWorkItem(existing[0]);
    }
  }

  const taskResource = buildTask({
    facilityId,
    type: input.type,
    title: input.title,
    detail: input.detail,
    priority: input.priority,
    dueAt: input.dueAt,
    caseId: input.caseId,
    patientId: input.patientId,
    referralId: input.referralId,
    ownerCapability: input.ownerCapability,
    ownerRole: input.ownerRole,
    ownerId: input.ownerId,
    timelineMilestone: input.timelineMilestone,
    agentName: input.agentName,
    abstentionReason: input.abstentionReason,
    createdByAgent: input.createdByAgent,
    idempotencyKey: input.idempotencyKey,
  });

  const created = await forFacility(medplum, facilityId).create<Task>(taskResource);
  return mapTaskToWorkItem(created);
}

/**
 * Atomically claims a work item, enforcing capability-scoped authorization and conflict detection.
 */
export async function claimWorkItem(params: ClaimWorkItemParams): Promise<WorkItem> {
  const { medplum, facilityId, itemId, input, principal, logger } = params;

  let task: Task;
  try {
    task = await medplum.readResource("Task", itemId);
  } catch {
    throw createDomainError(API_ERROR_CODES.WORK_ITEM_NOT_FOUND, {
      message: `Work item ${itemId} not found.`,
    });
  }

  const facilityAccountRef = `Organization/${facilityId}`;
  const belongsToFacility = task.meta?.accounts?.some(
    (acc) => acc.reference === facilityAccountRef,
  );
  if (!belongsToFacility) {
    throw createDomainError(API_ERROR_CODES.WORK_ITEM_NOT_FOUND, {
      message: `Work item ${itemId} not found at facility ${facilityId}.`,
    });
  }

  const existingWorkItem = mapTaskToWorkItem(task);
  const claimOwnerId = input.ownerId ?? input.claimedBy ?? principal.id;

  if (existingWorkItem.status === "completed") {
    throw createDomainError(API_ERROR_CODES.WORK_ITEM_ALREADY_COMPLETED, {
      message: "Cannot claim a work item that has already been completed.",
    });
  }

  if (existingWorkItem.status === "claimed" && existingWorkItem.ownerId !== claimOwnerId) {
    throw createDomainError(API_ERROR_CODES.WORK_ITEM_ALREADY_CLAIMED, {
      message: `Work item is already claimed by another practitioner (${existingWorkItem.ownerId}).`,
    });
  }

  // Capability check against required task capability
  if (existingWorkItem.ownerCapability) {
    const authz = authorize(principal, existingWorkItem.ownerCapability as Capability, {
      facilityId,
    });
    if (!authz.allowed) {
      logger?.warn(
        { principalId: principal.id, requiredCapability: existingWorkItem.ownerCapability },
        "Principal lacks required capability to claim work item",
      );
      throw createDomainError(API_ERROR_CODES.WORK_ITEM_CAPABILITY_DENIED, {
        message: `Principal lacks required capability '${existingWorkItem.ownerCapability}' to claim this work item.`,
      });
    }
  }

  const extensions: Extension[] = [...(task.extension ?? [])];
  if (input.ownerRole) {
    const roleUrl = fhirUrls.structureDefinition("task-owner-role");
    const existingIndex = extensions.findIndex((ext) => ext.url === roleUrl);
    if (existingIndex >= 0) {
      extensions[existingIndex] = { url: roleUrl, valueString: input.ownerRole };
    } else {
      extensions.push({ url: roleUrl, valueString: input.ownerRole });
    }
  }

  const updatedTask: Task = {
    ...task,
    status: "accepted",
    owner: reference("Practitioner", claimOwnerId, "owner id"),
    ...(extensions.length > 0 ? { extension: extensions } : {}),
  };

  const saved = await forFacility(medplum, facilityId).update(updatedTask);
  return mapTaskToWorkItem(saved);
}

/**
 * Marks a work item completed with resolution narrative and audit metadata.
 */
export async function completeWorkItem(params: CompleteWorkItemParams): Promise<WorkItem> {
  const { medplum, facilityId, itemId, input, principal } = params;

  let task: Task;
  try {
    task = await medplum.readResource("Task", itemId);
  } catch {
    throw createDomainError(API_ERROR_CODES.WORK_ITEM_NOT_FOUND, {
      message: `Work item ${itemId} not found.`,
    });
  }

  const facilityAccountRef = `Organization/${facilityId}`;
  const belongsToFacility = task.meta?.accounts?.some(
    (acc) => acc.reference === facilityAccountRef,
  );
  if (!belongsToFacility) {
    throw createDomainError(API_ERROR_CODES.WORK_ITEM_NOT_FOUND, {
      message: `Work item ${itemId} not found at facility ${facilityId}.`,
    });
  }

  if (task.status === "completed") {
    throw createDomainError(API_ERROR_CODES.WORK_ITEM_ALREADY_COMPLETED, {
      message: "Work item has already been completed.",
    });
  }

  const completedAt = input.completedAt ?? new Date().toISOString();
  const resolvedBy = input.resolvedBy ?? principal.id;

  const extensions: Extension[] = [...(task.extension ?? [])];

  const resolvedByUrl = fhirUrls.structureDefinition("task-resolved-by");
  const existingResolvedIdx = extensions.findIndex((ext) => ext.url === resolvedByUrl);
  if (existingResolvedIdx >= 0) {
    extensions[existingResolvedIdx] = { url: resolvedByUrl, valueString: resolvedBy };
  } else {
    extensions.push({ url: resolvedByUrl, valueString: resolvedBy });
  }

  if (input.resolution) {
    const resolutionUrl = fhirUrls.structureDefinition("task-resolution");
    const existingResIdx = extensions.findIndex((ext) => ext.url === resolutionUrl);
    if (existingResIdx >= 0) {
      extensions[existingResIdx] = { url: resolutionUrl, valueString: input.resolution };
    } else {
      extensions.push({ url: resolutionUrl, valueString: input.resolution });
    }
  }

  const updatedTask: Task = {
    ...task,
    status: "completed",
    executionPeriod: { end: completedAt },
    ...(extensions.length > 0 ? { extension: extensions } : {}),
    ...(input.resolution
      ? { output: [{ type: { text: "resolution" }, valueString: input.resolution }] }
      : {}),
  };

  const saved = await forFacility(medplum, facilityId).update(updatedTask);
  return mapTaskToWorkItem(saved);
}
