import { describe, expect, it } from "vitest";

import {
  claimWorkItemSchema,
  completeWorkItemSchema,
  createWorkItemSchema,
  worklistQuerySchema,
} from "../worklist.schema.js";

describe("worklist.schema (Phase P12, REQ-5, REQ-8, REQ-9)", () => {
  describe("worklistQuerySchema", () => {
    it("parses empty query with default limit and offset", () => {
      const parsed = worklistQuerySchema.parse({});
      expect(parsed.limit).toBe(50);
      expect(parsed.offset).toBe(0);
      expect(parsed.type).toBeUndefined();
      expect(parsed.status).toBeUndefined();
    });

    it("accepts valid query filters", () => {
      const parsed = worklistQuerySchema.parse({
        type: "hp_expiring",
        status: "open",
        priority: "urgent",
        ownerCapability: "hp.document",
        ownerId: "prac-123",
        caseId: "case-456",
        patientId: "pat-789",
        timelineMilestone: "T-1d",
        overdueOnly: "true",
        limit: "25",
        offset: "10",
      });

      expect(parsed.type).toBe("hp_expiring");
      expect(parsed.status).toBe("open");
      expect(parsed.priority).toBe("urgent");
      expect(parsed.ownerCapability).toBe("hp.document");
      expect(parsed.ownerId).toBe("prac-123");
      expect(parsed.caseId).toBe("case-456");
      expect(parsed.patientId).toBe("pat-789");
      expect(parsed.timelineMilestone).toBe("T-1d");
      expect(parsed.overdueOnly).toBe(true);
      expect(parsed.limit).toBe(25);
      expect(parsed.offset).toBe(10);
    });

    it("rejects invalid caseId format per LM-026", () => {
      const result = worklistQuerySchema.safeParse({
        caseId: "invalid/case/id!@#",
      });
      expect(result.success).toBe(false);
    });

    it("rejects unknown work item type", () => {
      const result = worklistQuerySchema.safeParse({
        type: "unknown_work_type",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("createWorkItemSchema", () => {
    it("parses valid work item creation with defaults", () => {
      const nowIso = new Date().toISOString();
      const parsed = createWorkItemSchema.parse({
        type: "prep_instructions",
        title: "Send bowel preparation instructions",
        dueAt: nowIso,
        caseId: "case-001",
        timelineMilestone: "T-14d",
      });

      expect(parsed.type).toBe("prep_instructions");
      expect(parsed.title).toBe("Send bowel preparation instructions");
      expect(parsed.detail).toBe("");
      expect(parsed.priority).toBe("routine");
      expect(parsed.dueAt).toBe(nowIso);
      expect(parsed.caseId).toBe("case-001");
      expect(parsed.timelineMilestone).toBe("T-14d");
      expect(parsed.createdByAgent).toBe(false);
    });

    it("parses full payload including agent abstention details (US-M-02)", () => {
      const nowIso = new Date().toISOString();
      const parsed = createWorkItemSchema.parse({
        type: "anesthesia_review",
        title: "Review high-risk airway",
        detail: "BMI > 40 with suspected OSA requiring physician evaluation",
        priority: "stat",
        dueAt: nowIso,
        caseId: "case-999",
        patientId: "pat-111",
        ownerCapability: "anesthesia.document",
        ownerRole: "ANESTHESIOLOGIST",
        ownerId: "dr-smith",
        timelineMilestone: "T-3d",
        agentName: "preopReadinessAgent",
        abstentionReason: "High-risk STOP-Bang score triggers mandatory clinical abstention",
        createdByAgent: true,
        idempotencyKey: "case-timeline:case-999:T-3d:anesthesia_review",
      });

      expect(parsed.type).toBe("anesthesia_review");
      expect(parsed.priority).toBe("stat");
      expect(parsed.agentName).toBe("preopReadinessAgent");
      expect(parsed.abstentionReason).toContain("STOP-Bang");
      expect(parsed.createdByAgent).toBe(true);
      expect(parsed.idempotencyKey).toBe("case-timeline:case-999:T-3d:anesthesia_review");
    });

    it("rejects invalid dueAt timestamp", () => {
      const result = createWorkItemSchema.safeParse({
        type: "prep_reminder",
        title: "Reminder",
        dueAt: "not-a-datetime",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid patientId per LM-026", () => {
      const result = createWorkItemSchema.safeParse({
        type: "final_confirmation",
        title: "Confirm transport",
        dueAt: new Date().toISOString(),
        patientId: "patient with spaces",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("claimWorkItemSchema", () => {
    it("accepts valid claim payload", () => {
      const parsed = claimWorkItemSchema.parse({
        claimedBy: "practitioner-42",
        ownerCapability: "hp.document",
      });
      expect(parsed.claimedBy).toBe("practitioner-42");
      expect(parsed.ownerCapability).toBe("hp.document");
    });

    it("rejects empty claimedBy string", () => {
      const result = claimWorkItemSchema.safeParse({
        claimedBy: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("completeWorkItemSchema", () => {
    it("accepts valid completion payload", () => {
      const parsed = completeWorkItemSchema.parse({
        resolvedBy: "practitioner-42",
        resolution: "H&P reviewed and certified within 30-day CMS window",
        notes: "Clear for monitored anesthesia care",
      });
      expect(parsed.resolvedBy).toBe("practitioner-42");
      expect(parsed.resolution).toContain("30-day CMS window");
      expect(parsed.notes).toContain("monitored anesthesia care");
    });

    it("rejects empty resolvedBy string", () => {
      const result = completeWorkItemSchema.safeParse({
        resolvedBy: "",
      });
      expect(result.success).toBe(false);
    });
  });
});
