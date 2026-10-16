/**
 * Day of Surgery: Intra-Op Room Capture, Multi-Role Surgical Timeout, Hard Gate 2 & 168-Hour Scope Lock Schemas.
 *
 * Regulatory & Clinical Citations:
 * - CMS 42 CFR § 416.52 (Condition for Coverage: Patient Admission, Assessment and Discharge)
 * - The Joint Commission Universal Protocol (UP.01.03.01) (Surgical Timeout)
 * - Multi-Society Guideline ASGE/SGNA/CDC/AAMI ST91 (Comprehensive Endoscope Reprocessing & 168-Hour Hang Time)
 * - ASGE/ACG 2022 Quality Indicators for GI Endoscopy (Adenoma Detection Rate & Withdrawal Time >= 6.0 min)
 */

import { z } from "zod";
import { PROCEDURE_EVENT_TYPES } from "@asc/types";

export const timeOutChecklistSchema = z.object({
  patientIdentity: z.boolean(),
  procedureConfirmed: z.boolean(),
  consentVerified: z.boolean(),
  allergiesReviewed: z.boolean(),
  equipmentReady: z.boolean(),
  anticoagulationReviewed: z.boolean(),
  siteAndLateralityConfirmed: z.boolean().optional(),
  prophylaxisReviewed: z.boolean().optional(),
  anticipatedIssuesReviewed: z.boolean().optional(),
});
export const TimeOutChecklistSchema = timeOutChecklistSchema;

export interface TimeOutChecklistInput {
  readonly patientIdentity: boolean;
  readonly procedureConfirmed: boolean;
  readonly consentVerified: boolean;
  readonly allergiesReviewed: boolean;
  readonly equipmentReady: boolean;
  readonly anticoagulationReviewed: boolean;
  readonly siteAndLateralityConfirmed?: boolean;
  readonly prophylaxisReviewed?: boolean;
  readonly anticipatedIssuesReviewed?: boolean;
}

export const timeOutParticipantRoleSchema = z.enum([
  "circulating_rn",
  "endoscopist",
  "anesthesia",
  "tech",
]);
export const TimeOutParticipantRoleSchema = timeOutParticipantRoleSchema;
export type TimeOutParticipantRole = z.infer<typeof timeOutParticipantRoleSchema>;

export const timeOutParticipantSchema = z.object({
  userId: z.string().trim().min(1, "User ID is required"),
  name: z.string().trim().min(1, "Participant name is required"),
  role: timeOutParticipantRoleSchema,
  acknowledgedAt: z.string().datetime().optional(),
});
export const TimeOutParticipantSchema = timeOutParticipantSchema;

export interface TimeOutParticipantInput {
  readonly userId: string;
  readonly name: string;
  readonly role: TimeOutParticipantRole;
  readonly acknowledgedAt?: string;
}

export const signTimeOutInputSchema = z.object({
  checklist: timeOutChecklistSchema,
  role: z.enum(["SURGEON", "NURSE", "ANESTHESIOLOGIST"]).optional(),
  participants: z.array(timeOutParticipantSchema).optional(),
  completedAt: z.string().datetime().optional(),
});
export const SignTimeOutInputSchema = signTimeOutInputSchema;

export interface SignTimeOutInput {
  readonly checklist: TimeOutChecklistInput;
  readonly role?: "SURGEON" | "NURSE" | "ANESTHESIOLOGIST";
  readonly participants?: ReadonlyArray<TimeOutParticipantInput>;
  readonly completedAt?: string;
}

export const procedureEventTypeSchema = z.enum(PROCEDURE_EVENT_TYPES);
export const ProcedureEventTypeSchema = procedureEventTypeSchema;

export const recordProcedureEventInputSchema = z.object({
  type: procedureEventTypeSchema,
  note: z.string().trim().max(1000, "Note cannot exceed 1000 characters").optional(),
  recordedAt: z.string().datetime().optional(),
  at: z.string().datetime().optional(),
});
export const RecordProcedureEventInputSchema = recordProcedureEventInputSchema;

export interface RecordProcedureEventInput {
  readonly type: (typeof PROCEDURE_EVENT_TYPES)[number];
  readonly note?: string;
  readonly recordedAt?: string;
  readonly at?: string;
}

export const assignScopeInputSchema = z.object({
  scopeSerial: z
    .string()
    .trim()
    .min(1, "Scope serial is required")
    .max(64, "Scope serial cannot exceed 64 characters"),
  scopeModel: z.string().trim().min(1).max(128).optional(),
  reprocessedAt: z.string().datetime("Reprocessing timestamp must be a valid ISO 8601 datetime"),
  leakTestResult: z.enum(["PASS", "FAIL"]),
  cycleOutcome: z.enum(["PASS", "FAIL"]),
  assignedAt: z.string().datetime().optional(),
});
export const AssignScopeInputSchema = assignScopeInputSchema;

export interface AssignScopeInput {
  readonly scopeSerial: string;
  readonly scopeModel?: string;
  readonly reprocessedAt: string;
  readonly leakTestResult: "PASS" | "FAIL";
  readonly cycleOutcome: "PASS" | "FAIL";
  readonly assignedAt?: string;
}

export const gate2OverrideInputSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Override reason must be at least 10 characters")
    .max(500, "Override reason cannot exceed 500 characters"),
  actorName: z.string().trim().min(1, "Actor name is required").max(128),
  actorRole: z.string().trim().min(1).max(64).optional(),
  overriddenAt: z.string().datetime().optional(),
});
export const Gate2OverrideInputSchema = gate2OverrideInputSchema;

export interface Gate2OverrideInput {
  readonly reason: string;
  readonly actorName: string;
  readonly actorRole?: string;
  readonly overriddenAt?: string;
}
