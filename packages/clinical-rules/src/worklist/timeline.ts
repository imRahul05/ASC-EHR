/**
 * Pre-Operative Timeline Engine & Unified Worklist SLA Rules
 *
 * Implements deterministic clinical milestone scheduling (T-14d down to T-0),
 * short-notice booking clamping, and queue routing for the FHIR Task engine.
 *
 * US Healthcare Regulatory Citations:
 * - CMS 42 CFR § 416.52: Conditions for Coverage - Surgical Services.
 *   Mandates comprehensive medical history and physical examination (H&P) completed
 *   no more than 30 days prior to procedure, with day-of reassessment before discharge.
 * - No Surprises Act 45 CFR § 149.610: Requirements for Provision of Good Faith Estimates
 *   (GFE) to uninsured and self-pay individuals within statutory advance notice windows
 *   (within 1 business day if scheduled >= 10 business days prior; 3 days if >= 3 days).
 * - HIPAA 45 CFR § 164.312(b): Audit controls, technical access controls, and
 *   capability-scoped role validation for clinical work item execution and claiming.
 */

import type {
  Capability,
  PreopTimelineMilestone,
  WorkItem,
  WorkItemPriority,
  WorkItemType,
} from "@asc/types";

export interface WorkItemQueueConfig {
  readonly queue: string;
  readonly capability: Capability;
  readonly defaultPriority: WorkItemPriority;
  readonly slaHours: number;
  readonly title: string;
}

export const WORK_ITEM_QUEUE_MAP: Readonly<Record<WorkItemType, WorkItemQueueConfig>> = {
  sign_note: {
    queue: "physician",
    capability: "note.sign",
    defaultPriority: "urgent",
    slaHours: 24,
    title: "Sign procedure operative report",
  },
  eligibility_failed: {
    queue: "financial",
    capability: "patient.eligibility.check",
    defaultPriority: "urgent",
    slaHours: 12,
    title: "Resolve failed insurance eligibility",
  },
  referral_intake: {
    queue: "front_desk",
    capability: "referral.triage",
    defaultPriority: "routine",
    slaHours: 48,
    title: "Triage clinical referral document",
  },
  pending_pathology: {
    queue: "pathology",
    capability: "pathology.reconcile",
    defaultPriority: "routine",
    slaHours: 120,
    title: "Reconcile outstanding biopsy pathology",
  },
  coding: {
    queue: "coding",
    capability: "coding.review",
    defaultPriority: "routine",
    slaHours: 72,
    title: "Review endoscopy CPT/ICD coding",
  },
  result_letter: {
    queue: "pathology",
    capability: "pathology.letter.send",
    defaultPriority: "routine",
    slaHours: 48,
    title: "Send biopsy result notification letter",
  },
  med_hold_review: {
    queue: "nursing",
    capability: "medhold.review",
    defaultPriority: "urgent",
    slaHours: 24,
    title: "Review anticoagulant/antiplatelet hold protocol",
  },
  prep_instructions: {
    queue: "nursing",
    capability: "case.advance",
    defaultPriority: "routine",
    slaHours: 48,
    title: "Deliver bowel preparation instructions",
  },
  records_request: {
    queue: "front_desk",
    capability: "schedule.manage",
    defaultPriority: "routine",
    slaHours: 72,
    title: "Request prior endoscopy and medical records",
  },
  eligibility_recheck: {
    queue: "financial",
    capability: "patient.eligibility.check",
    defaultPriority: "routine",
    slaHours: 24,
    title: "Re-verify insurance eligibility prior to surgery",
  },
  estimate_delivery: {
    queue: "financial",
    capability: "patient.eligibility.check",
    defaultPriority: "urgent",
    slaHours: 24,
    title: "Deliver Good Faith Estimate (45 CFR § 149.610)",
  },
  preop_call: {
    queue: "nursing",
    capability: "case.advance",
    defaultPriority: "routine",
    slaHours: 24,
    title: "Conduct pre-op phone assessment and escort confirmation",
  },
  anesthesia_review: {
    queue: "anesthesia",
    capability: "anesthesia.document",
    defaultPriority: "urgent",
    slaHours: 24,
    title: "Pre-procedure anesthesia airway & risk evaluation",
  },
  prep_reminder: {
    queue: "nursing",
    capability: "case.advance",
    defaultPriority: "routine",
    slaHours: 12,
    title: "Send bowel preparation reminder and hydration checklist",
  },
  final_confirmation: {
    queue: "front_desk",
    capability: "schedule.manage",
    defaultPriority: "urgent",
    slaHours: 12,
    title: "Final procedure confirmation & NPO instructions",
  },
  dayof_prep_check: {
    queue: "nursing",
    capability: "case.advance",
    defaultPriority: "stat",
    slaHours: 4,
    title: "Day-of admission prep quality and escort check",
  },
  hp_expiring: {
    queue: "physician",
    capability: "hp.document",
    defaultPriority: "urgent",
    slaHours: 24,
    title: "Pre-procedure H&P expiring (CMS 42 CFR § 416.52)",
  },
  auth_revalidation: {
    queue: "financial",
    capability: "patient.eligibility.check",
    defaultPriority: "urgent",
    slaHours: 24,
    title: "Revalidate prior authorization 278 validity window",
  },
  cancelled_followup: {
    queue: "front_desk",
    capability: "schedule.manage",
    defaultPriority: "routine",
    slaHours: 48,
    title: "Follow up cancelled or no-show procedure for rebooking",
  },
};

export interface PreopTimelineInput {
  readonly caseId: string;
  readonly patientId: string;
  readonly procedureDate: string | Date;
  readonly bookedAt: string | Date;
  readonly hasBowelPrep?: boolean;
  readonly isSelfPayOrUninsured?: boolean;
  readonly requiresAnesthesiaReview?: boolean;
}

export interface PlannedWorkItem {
  readonly type: WorkItemType;
  readonly title: string;
  readonly detail: string;
  readonly priority: WorkItemPriority;
  readonly dueAt: string;
  readonly milestone: PreopTimelineMilestone;
  readonly ownerCapability: Capability;
  readonly caseId: string;
  readonly patientId: string;
  readonly idempotencyKey: string;
  readonly agentName?: string;
  readonly abstentionReason?: string;
  readonly createdByAgent?: boolean;
}

interface MilestoneDefinition {
  readonly milestone: PreopTimelineMilestone;
  readonly daysBefore: number;
  readonly items: readonly {
    readonly type: WorkItemType;
    readonly title: string;
    readonly detail: string;
    readonly condition?: (input: PreopTimelineInput) => boolean;
    readonly elevateIfClamped?: boolean;
  }[];
}

const PREOP_MILESTONES: readonly MilestoneDefinition[] = [
  {
    milestone: "T-14d",
    daysBefore: 14,
    items: [
      {
        type: "prep_instructions",
        title: "Deliver bowel preparation instructions and guide",
        detail: "Provide patient with colonoscopy/endoscopy preparation protocol and dietary guidelines.",
        condition: (input) => input.hasBowelPrep !== false,
      },
      {
        type: "records_request",
        title: "Request prior endoscopy and medical records",
        detail: "Obtain outside procedural records, pathology reports, and specialized clearances.",
      },
      {
        type: "estimate_delivery",
        title: "Deliver Good Faith Estimate (45 CFR § 149.610)",
        detail: "Provide Good Faith Estimate of expected procedure charges to self-pay/uninsured patient.",
        condition: (input) => input.isSelfPayOrUninsured === true,
        elevateIfClamped: true,
      },
    ],
  },
  {
    milestone: "T-7d",
    daysBefore: 7,
    items: [
      {
        type: "eligibility_recheck",
        title: "Re-verify insurance eligibility prior to surgery",
        detail: "Execute 270/271 real-time eligibility inquiry to confirm active procedural coverage.",
      },
      {
        type: "auth_revalidation",
        title: "Revalidate prior authorization approval window",
        detail: "Confirm payer prior authorization certification dates cover scheduled procedure date.",
      },
    ],
  },
  {
    milestone: "T-3d",
    daysBefore: 3,
    items: [
      {
        type: "preop_call",
        title: "Conduct pre-op phone assessment and escort confirmation",
        detail: "Contact patient to review health status changes, medication holds, and responsible adult escort.",
      },
      {
        type: "anesthesia_review",
        title: "Pre-procedure anesthesia airway & risk evaluation",
        detail: "Physician/CRNA review of elevated airway risk, high BMI, or ASA III+ comorbidity profile.",
        condition: (input) => input.requiresAnesthesiaReview === true,
      },
    ],
  },
  {
    milestone: "T-2d",
    daysBefore: 2,
    items: [
      {
        type: "prep_reminder",
        title: "Send bowel preparation reminder and hydration checklist",
        detail: "Verify patient has acquired prep solution, clear liquids, and understands dosing schedule.",
        condition: (input) => input.hasBowelPrep !== false,
      },
    ],
  },
  {
    milestone: "T-1d",
    daysBefore: 1,
    items: [
      {
        type: "final_confirmation",
        title: "Final procedure confirmation & NPO instructions",
        detail: "Confirm arrival time, fasting (NPO past midnight) instructions, and ride verification.",
        elevateIfClamped: true,
      },
    ],
  },
  {
    milestone: "T-0",
    daysBefore: 0,
    items: [
      {
        type: "dayof_prep_check",
        title: "Day-of admission prep quality and escort check",
        detail: "Clinical intake assessment of bowel preparation adequacy (Boston Prep Scale) and escort presence.",
      },
    ],
  },
];

/**
 * Builds standard pre-op timeline schedule items for a surgical case.
 *
 * Implements AC-E-01-3 short-notice booking clamping: if scheduled with fewer
 * days remaining than a milestone's target offset, the item's due date is clamped
 * to booking time with appropriate priority escalation.
 */
export function buildPreopTimelineWorkItems(
  input: PreopTimelineInput,
): readonly PlannedWorkItem[] {
  const procedureMs = new Date(input.procedureDate).getTime();
  const bookedMs = new Date(input.bookedAt).getTime();
  const plannedItems: PlannedWorkItem[] = [];

  for (const milestoneDef of PREOP_MILESTONES) {
    const targetOffsetMs = milestoneDef.daysBefore * 24 * 60 * 60 * 1000;
    const nominalDueMs = procedureMs - targetOffsetMs;

    // Short-notice booking clamping (AC-E-01-3): clamp overdue milestones to booking time
    const isClamped = nominalDueMs < bookedMs;
    const effectiveDueMs = isClamped ? bookedMs : nominalDueMs;
    const dueAtIso = new Date(effectiveDueMs).toISOString();

    for (const itemDef of milestoneDef.items) {
      if (itemDef.condition && !itemDef.condition(input)) {
        continue;
      }

      const queueConfig = WORK_ITEM_QUEUE_MAP[itemDef.type];
      const priority: WorkItemPriority = isClamped && itemDef.elevateIfClamped
        ? "urgent"
        : queueConfig.defaultPriority;

      // Deterministic idempotency key: case-timeline:{caseId}:{milestone}:{type}
      const idempotencyKey = `case-timeline:${input.caseId}:${milestoneDef.milestone}:${itemDef.type}`;

      plannedItems.push({
        type: itemDef.type,
        title: itemDef.title,
        detail: itemDef.detail,
        priority,
        dueAt: dueAtIso,
        milestone: milestoneDef.milestone,
        ownerCapability: queueConfig.capability,
        caseId: input.caseId,
        patientId: input.patientId,
        idempotencyKey,
      });
    }
  }

  return plannedItems;
}

/**
 * Builds an immediate high-priority work item when real-time eligibility verification fails (US-B-11).
 */
export function buildEligibilityFailedWorkItem(input: {
  readonly caseId?: string;
  readonly patientId: string;
  readonly reason: string;
  readonly priority?: WorkItemPriority;
  readonly dueAt?: string;
}): PlannedWorkItem {
  const queueConfig = WORK_ITEM_QUEUE_MAP.eligibility_failed;
  const dueAt = input.dueAt ?? new Date().toISOString();
  const caseId = input.caseId ?? "unassigned";
  const idempotencyKey = `eligibility-failed:${input.patientId}:${caseId}`;

  return {
    type: "eligibility_failed",
    title: queueConfig.title,
    detail: input.reason,
    priority: input.priority ?? "urgent",
    dueAt,
    milestone: "T-7d",
    ownerCapability: queueConfig.capability,
    caseId,
    patientId: input.patientId,
    idempotencyKey,
  };
}

/**
 * Builds an urgent work item when an H&P document is expiring under CMS 42 CFR § 416.52 (US-D-11).
 */
export function buildHpExpiringWorkItem(input: {
  readonly caseId: string;
  readonly patientId: string;
  readonly hpDate: string;
  readonly procedureDate: string;
  readonly dueAt?: string;
}): PlannedWorkItem {
  const queueConfig = WORK_ITEM_QUEUE_MAP.hp_expiring;
  const dueAt = input.dueAt ?? new Date().toISOString();
  const detail = `History & Physical examination dated ${input.hpDate} exceeds or approaches the CMS 42 CFR § 416.52 30-day validity window for procedure date ${input.procedureDate}. Attending physician update note or complete re-examination required prior to surgical intervention.`;
  const idempotencyKey = `hp-expiring:${input.caseId}:${input.hpDate}`;

  return {
    type: "hp_expiring",
    title: queueConfig.title,
    detail,
    priority: "urgent",
    dueAt,
    milestone: "T-1d",
    ownerCapability: queueConfig.capability,
    caseId: input.caseId,
    patientId: input.patientId,
    idempotencyKey,
  };
}

/**
 * Builds a mandatory clinical work item when an AI agent abstains from automated clearance (US-M-02).
 */
export function buildAgentAbstentionWorkItem(input: {
  readonly caseId: string;
  readonly patientId: string;
  readonly agentName: string;
  readonly reason: string;
  readonly capability?: Capability;
  readonly dueAt?: string;
}): PlannedWorkItem {
  const queueConfig = WORK_ITEM_QUEUE_MAP.anesthesia_review;
  const dueAt = input.dueAt ?? new Date().toISOString();
  const detail = `AI Agent '${input.agentName}' abstained from automatic clearance: ${input.reason}. Manual clinical review and verification mandatory.`;
  const idempotencyKey = `agent-abstention:${input.caseId}:${input.agentName}`;

  return {
    type: "anesthesia_review",
    title: `Clinical review: AI agent abstention (${input.agentName})`,
    detail,
    priority: "urgent",
    dueAt,
    milestone: "T-3d",
    ownerCapability: input.capability ?? queueConfig.capability,
    caseId: input.caseId,
    patientId: input.patientId,
    idempotencyKey,
    agentName: input.agentName,
    abstentionReason: input.reason,
    createdByAgent: true,
  };
}

/**
 * Evaluates whether a work item is overdue based on current time.
 */
export function isWorkItemOverdue(
  item: Pick<WorkItem, "dueAt" | "status">,
  nowIso?: string,
): boolean {
  if (item.status === "completed" || item.status === "done") {
    return false;
  }
  const nowMs = nowIso ? new Date(nowIso).getTime() : Date.now();
  const dueMs = new Date(item.dueAt).getTime();
  return dueMs < nowMs;
}

const PRIORITY_SORT_RANK: Readonly<Record<WorkItemPriority, number>> = {
  stat: 0,
  urgent: 1,
  high: 1,
  routine: 2,
  normal: 2,
  low: 3,
};

/**
 * Pure queue sorting function:
 * 1. Overdue open items first
 * 2. Highest priority rank (stat > urgent > routine > low)
 * 3. Earliest due date
 * 4. Earliest creation date
 */
export function sortWorkItemsForQueue(
  items: readonly WorkItem[],
  nowIso?: string,
): readonly WorkItem[] {
  return [...items].sort((a, b) => {
    const aOverdue = isWorkItemOverdue(a, nowIso);
    const bOverdue = isWorkItemOverdue(b, nowIso);
    if (aOverdue !== bOverdue) {
      return aOverdue ? -1 : 1;
    }

    const aRank = PRIORITY_SORT_RANK[a.priority];
    const bRank = PRIORITY_SORT_RANK[b.priority];
    if (aRank !== bRank) {
      return aRank - bRank;
    }

    const aDueMs = new Date(a.dueAt).getTime();
    const bDueMs = new Date(b.dueAt).getTime();
    if (aDueMs !== bDueMs) {
      return aDueMs - bDueMs;
    }

    const aCreatedMs = new Date(a.createdAt).getTime();
    const bCreatedMs = new Date(b.createdAt).getTime();
    return aCreatedMs - bCreatedMs;
  });
}
