import { WORK_ITEM_TYPES, type WorkItem } from "@asc/types";
import { describe, expect, it } from "vitest";

import {
  WORK_ITEM_QUEUE_MAP,
  buildAgentAbstentionWorkItem,
  buildEligibilityFailedWorkItem,
  buildHpExpiringWorkItem,
  buildPreopTimelineWorkItems,
  isWorkItemOverdue,
  sortWorkItemsForQueue,
} from "./timeline.js";

describe("worklist timeline & SLA rules (Phase P12, REQ-5, REQ-8, REQ-9)", () => {
  describe("WORK_ITEM_QUEUE_MAP", () => {
    it("defines queue configuration for all 19 WorkItemTypes", () => {
      for (const itemType of WORK_ITEM_TYPES) {
        const config = WORK_ITEM_QUEUE_MAP[itemType];
        expect(config, `Missing queue config for ${itemType}`).toBeDefined();
        expect(config.queue.length).toBeGreaterThan(0);
        expect(config.capability.length).toBeGreaterThan(0);
        expect(["stat", "urgent", "routine"]).toContain(config.defaultPriority);
        expect(config.slaHours).toBeGreaterThan(0);
        expect(config.title.length).toBeGreaterThan(0);
      }
    });
  });

  describe("buildPreopTimelineWorkItems", () => {
    const procedureDate = "2026-11-20T08:00:00.000Z";
    const bookedAt = "2026-11-01T10:00:00.000Z"; // 19 days prior (normal advance notice)

    it("generates complete milestone schedule for standard colonoscopy with insurance", () => {
      const items = buildPreopTimelineWorkItems({
        caseId: "case-001",
        patientId: "pat-001",
        procedureDate,
        bookedAt,
        hasBowelPrep: true,
        isSelfPayOrUninsured: false,
        requiresAnesthesiaReview: false,
      });

      expect(items.length).toBeGreaterThanOrEqual(6);

      const milestones = items.map((i) => i.milestone);
      expect(milestones).toContain("T-14d");
      expect(milestones).toContain("T-7d");
      expect(milestones).toContain("T-3d");
      expect(milestones).toContain("T-2d");
      expect(milestones).toContain("T-1d");
      expect(milestones).toContain("T-0");

      const types = items.map((i) => i.type);
      expect(types).toContain("prep_instructions");
      expect(types).toContain("records_request");
      expect(types).toContain("eligibility_recheck");
      expect(types).toContain("auth_revalidation");
      expect(types).toContain("preop_call");
      expect(types).toContain("prep_reminder");
      expect(types).toContain("final_confirmation");
      expect(types).toContain("dayof_prep_check");

      // Verify deterministic idempotency key
      for (const item of items) {
        expect(item.idempotencyKey).toBe(`case-timeline:case-001:${item.milestone}:${item.type}`);
        expect(item.caseId).toBe("case-001");
        expect(item.patientId).toBe("pat-001");
      }
    });

    it("includes Good Faith Estimate delivery for self-pay patients (45 CFR § 149.610)", () => {
      const items = buildPreopTimelineWorkItems({
        caseId: "case-gfe",
        patientId: "pat-gfe",
        procedureDate,
        bookedAt,
        isSelfPayOrUninsured: true,
      });

      const gfeItem = items.find((i) => i.type === "estimate_delivery");
      expect(gfeItem).toBeDefined();
      expect(gfeItem?.milestone).toBe("T-14d");
      expect(gfeItem?.ownerCapability).toBe("patient.eligibility.check");
    });

    it("includes anesthesia review when clinical comorbidity triggers exist", () => {
      const items = buildPreopTimelineWorkItems({
        caseId: "case-anes",
        patientId: "pat-anes",
        procedureDate,
        bookedAt,
        requiresAnesthesiaReview: true,
      });

      const anesItem = items.find((i) => i.type === "anesthesia_review");
      expect(anesItem).toBeDefined();
      expect(anesItem?.milestone).toBe("T-3d");
      expect(anesItem?.ownerCapability).toBe("anesthesia.document");
    });

    it("omits bowel prep items when hasBowelPrep is false (e.g. upper EGD)", () => {
      const items = buildPreopTimelineWorkItems({
        caseId: "case-egd",
        patientId: "pat-egd",
        procedureDate,
        bookedAt,
        hasBowelPrep: false,
      });

      const types = items.map((i) => i.type);
      expect(types).not.toContain("prep_instructions");
      expect(types).not.toContain("prep_reminder");
    });

    it("clamps nominal milestone dates to booking time for short-notice cases (AC-E-01-3)", () => {
      // Booked only 2 days before surgery
      const shortNoticeBooking = "2026-11-18T14:00:00.000Z";
      const items = buildPreopTimelineWorkItems({
        caseId: "case-urgent",
        patientId: "pat-urgent",
        procedureDate,
        bookedAt: shortNoticeBooking,
        isSelfPayOrUninsured: true,
      });

      // T-14d, T-7d, T-3d nominal dates were before shortNoticeBooking, so they must be clamped
      const t14Items = items.filter((i) => i.milestone === "T-14d");
      for (const item of t14Items) {
        expect(item.dueAt).toBe(new Date(shortNoticeBooking).toISOString());
      }

      // estimate_delivery should be elevated to urgent when clamped
      const gfeItem = items.find((i) => i.type === "estimate_delivery");
      expect(gfeItem?.priority).toBe("urgent");
    });
  });

  describe("buildEligibilityFailedWorkItem", () => {
    it("creates urgent work item with patient eligibility capability (US-B-11)", () => {
      const item = buildEligibilityFailedWorkItem({
        caseId: "case-el-1",
        patientId: "pat-el-1",
        reason: "Payer 271 response: Member coverage terminated on 2026-10-01",
      });

      expect(item.type).toBe("eligibility_failed");
      expect(item.priority).toBe("urgent");
      expect(item.ownerCapability).toBe("patient.eligibility.check");
      expect(item.detail).toContain("Member coverage terminated");
      expect(item.idempotencyKey).toBe("eligibility-failed:pat-el-1:case-el-1");
    });
  });

  describe("buildHpExpiringWorkItem", () => {
    it("creates urgent physician work item citing CMS 42 CFR § 416.52 (US-D-11)", () => {
      const item = buildHpExpiringWorkItem({
        caseId: "case-hp-1",
        patientId: "pat-hp-1",
        hpDate: "2026-09-15",
        procedureDate: "2026-11-20",
      });

      expect(item.type).toBe("hp_expiring");
      expect(item.priority).toBe("urgent");
      expect(item.ownerCapability).toBe("hp.document");
      expect(item.detail).toContain("CMS 42 CFR § 416.52");
      expect(item.idempotencyKey).toBe("hp-expiring:case-hp-1:2026-09-15");
    });
  });

  describe("buildAgentAbstentionWorkItem", () => {
    it("creates mandatory review work item when AI agent abstains (US-M-02)", () => {
      const item = buildAgentAbstentionWorkItem({
        caseId: "case-ai-1",
        patientId: "pat-ai-1",
        agentName: "preopReadinessAgent",
        reason: "Uncertain anticoagulation cessation window for novel oral anticoagulant",
      });

      expect(item.type).toBe("anesthesia_review");
      expect(item.createdByAgent).toBe(true);
      expect(item.agentName).toBe("preopReadinessAgent");
      expect(item.abstentionReason).toContain("anticoagulation cessation");
      expect(item.idempotencyKey).toBe("agent-abstention:case-ai-1:preopReadinessAgent");
    });
  });

  describe("isWorkItemOverdue", () => {
    const pastIso = "2026-10-01T00:00:00.000Z";
    const futureIso = "2026-12-01T00:00:00.000Z";
    const nowIso = "2026-11-01T00:00:00.000Z";

    it("returns true for open items past dueAt", () => {
      expect(isWorkItemOverdue({ dueAt: pastIso, status: "open" }, nowIso)).toBe(true);
      expect(isWorkItemOverdue({ dueAt: pastIso, status: "claimed" }, nowIso)).toBe(true);
    });

    it("returns false for open items with future dueAt", () => {
      expect(isWorkItemOverdue({ dueAt: futureIso, status: "open" }, nowIso)).toBe(false);
    });

    it("returns false for completed or done items even if past dueAt", () => {
      expect(isWorkItemOverdue({ dueAt: pastIso, status: "completed" }, nowIso)).toBe(false);
      expect(isWorkItemOverdue({ dueAt: pastIso, status: "done" }, nowIso)).toBe(false);
    });
  });

  describe("sortWorkItemsForQueue", () => {
    const nowIso = "2026-11-01T12:00:00.000Z";

    it("sorts overdue items first, then by priority rank, then dueAt", () => {
      const items: readonly WorkItem[] = [
        {
          id: "item-routine-future",
          type: "prep_instructions",
          title: "Routine future",
          detail: "",
          priority: "routine",
          status: "open",
          dueAt: "2026-11-10T12:00:00.000Z",
          createdAt: "2026-11-01T08:00:00.000Z",
        },
        {
          id: "item-stat-future",
          type: "dayof_prep_check",
          title: "Stat future",
          detail: "",
          priority: "stat",
          status: "open",
          dueAt: "2026-11-05T12:00:00.000Z",
          createdAt: "2026-11-01T08:00:00.000Z",
        },
        {
          id: "item-overdue-urgent",
          type: "eligibility_failed",
          title: "Overdue urgent",
          detail: "",
          priority: "urgent",
          status: "open",
          dueAt: "2026-10-31T12:00:00.000Z",
          createdAt: "2026-10-25T08:00:00.000Z",
        },
        {
          id: "item-overdue-stat",
          type: "anesthesia_review",
          title: "Overdue stat",
          detail: "",
          priority: "stat",
          status: "open",
          dueAt: "2026-10-30T12:00:00.000Z",
          createdAt: "2026-10-25T08:00:00.000Z",
        },
      ];

      const sorted = sortWorkItemsForQueue(items, nowIso);

      expect(sorted[0]?.id).toBe("item-overdue-stat");
      expect(sorted[1]?.id).toBe("item-overdue-urgent");
      expect(sorted[2]?.id).toBe("item-stat-future");
      expect(sorted[3]?.id).toBe("item-routine-future");
    });
  });
});
