/**
 * WorkItem & FHIR Task Engine Validation Schemas
 *
 * Implements validation rules for unified work queues, timeline schedules, and task claims.
 *
 * Regulatory citations:
 * - CMS 42 CFR § 416.52: Conditions for Coverage - Patient assessment, H&P 30-day window,
 *   and pre-procedure readiness verification before surgical intervention.
 * - No Surprises Act 45 CFR § 149.610: Good Faith Estimates for uninsured/self-pay patients
 *   and timely financial clearance delivery.
 * - HIPAA 45 CFR § 164.312(b): Audit controls and role/capability enforcement for clinical tasks.
 */

import {
  PARTICIPANT_ROLES,
  PREOP_TIMELINE_MILESTONES,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_STATUSES,
  WORK_ITEM_TYPES,
} from "@asc/types";
import { z } from "zod";

const FHIR_ID_REGEX = /^[A-Za-z0-9.-]{1,64}$/;

export const worklistQuerySchema = z.object({
  facilityId: z.string().regex(FHIR_ID_REGEX, "Invalid facilityId format").optional(),
  type: z.enum(WORK_ITEM_TYPES).optional(),
  status: z.enum([...WORK_ITEM_STATUSES, "done"] as const).optional(),
  priority: z
    .enum(["routine", "urgent", "stat", "low", "normal", "high"])
    .optional(),
  ownerCapability: z.string().min(1).max(128).optional(),
  ownerId: z.string().min(1).max(64).optional(),
  caseId: z.string().regex(FHIR_ID_REGEX, "Invalid caseId format").optional(),
  patientId: z.string().regex(FHIR_ID_REGEX, "Invalid patientId format").optional(),
  timelineMilestone: z.enum(PREOP_TIMELINE_MILESTONES).optional(),
  overdueOnly: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((val) => val === true || val === "true")
    .optional(),
  limit: z.coerce.number().int().min(1).max(250).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type WorklistQuery = z.infer<typeof worklistQuerySchema>;

export const createWorkItemSchema = z.object({
  facilityId: z.string().regex(FHIR_ID_REGEX, "Invalid facilityId format").optional(),
  type: z.enum(WORK_ITEM_TYPES),
  title: z.string().min(1).max(200),
  detail: z.string().max(2000).default(""),
  priority: z.enum(WORK_ITEM_PRIORITIES).default("routine"),
  dueAt: z.string().datetime(),
  caseId: z.string().regex(FHIR_ID_REGEX, "Invalid caseId format").optional(),
  patientId: z.string().regex(FHIR_ID_REGEX, "Invalid patientId format").optional(),
  referralId: z.string().regex(FHIR_ID_REGEX, "Invalid referralId format").optional(),
  ownerCapability: z.string().min(1).max(128).optional(),
  ownerRole: z.enum(PARTICIPANT_ROLES).optional(),
  ownerId: z.string().min(1).max(64).optional(),
  timelineMilestone: z.enum(PREOP_TIMELINE_MILESTONES).optional(),
  agentName: z.string().min(1).max(64).optional(),
  abstentionReason: z.string().max(1000).optional(),
  createdByAgent: z.boolean().default(false),
  idempotencyKey: z.string().min(1).max(128).optional(),
});

export type CreateWorkItemSchemaInput = z.infer<typeof createWorkItemSchema>;
export type CreateWorkItemInput = CreateWorkItemSchemaInput;

export const claimWorkItemSchema = z.object({
  claimedBy: z.string().min(1).max(64).optional(),
  ownerId: z.string().min(1).max(64).optional(),
  ownerRole: z.enum(PARTICIPANT_ROLES).optional(),
  ownerCapability: z.string().min(1).max(128).optional(),
});

export type ClaimWorkItemInput = z.infer<typeof claimWorkItemSchema>;

export const completeWorkItemSchema = z.object({
  resolvedBy: z.string().min(1).max(64).optional(),
  resolution: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
  completedAt: z.string().datetime().optional(),
});

export type CompleteWorkItemInput = z.infer<typeof completeWorkItemSchema>;

