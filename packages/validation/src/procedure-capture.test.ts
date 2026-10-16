import { describe, expect, it } from "vitest";
import {
  assignScopeInputSchema,
  gate2OverrideInputSchema,
  recordProcedureEventInputSchema,
  signTimeOutInputSchema,
  timeOutChecklistSchema,
  timeOutParticipantSchema,
} from "./procedure-capture.js";

const BASE_CHECKLIST = {
  patientIdentity: true,
  procedureConfirmed: true,
  consentVerified: true,
  allergiesReviewed: true,
  equipmentReady: true,
  anticoagulationReviewed: true,
};

describe("timeOutChecklistSchema", () => {
  it("accepts a standard 6-item checklist", () => {
    expect(timeOutChecklistSchema.parse(BASE_CHECKLIST)).toEqual(BASE_CHECKLIST);
  });

  it("accepts an extended 9-item AC-F-05-1 checklist", () => {
    const extended = {
      ...BASE_CHECKLIST,
      siteAndLateralityConfirmed: true,
      prophylaxisReviewed: true,
      anticipatedIssuesReviewed: true,
    };
    const parsed = timeOutChecklistSchema.parse(extended);
    expect(parsed.siteAndLateralityConfirmed).toBe(true);
    expect(parsed.prophylaxisReviewed).toBe(true);
    expect(parsed.anticipatedIssuesReviewed).toBe(true);
  });

  it("rejects checklist with missing required fields", () => {
    expect(timeOutChecklistSchema.safeParse({ patientIdentity: true }).success).toBe(false);
  });
});

describe("timeOutParticipantSchema & signTimeOutInputSchema", () => {
  it("validates a multi-role participant", () => {
    const valid = {
      userId: "usr-1",
      name: "Jane Doe, RN",
      role: "circulating_rn" as const,
      acknowledgedAt: new Date().toISOString(),
    };
    expect(timeOutParticipantSchema.parse(valid).role).toBe("circulating_rn");
  });

  it("rejects invalid participant role", () => {
    expect(timeOutParticipantSchema.safeParse({ userId: "u1", name: "J", role: "invalid" }).success).toBe(false);
  });

  it("accepts signTimeOutInputSchema with checklist and participants", () => {
    const input = {
      checklist: BASE_CHECKLIST,
      participants: [{ userId: "usr-circ-1", name: "Alice RN", role: "circulating_rn" as const }],
      completedAt: new Date().toISOString(),
    };
    expect(signTimeOutInputSchema.parse(input).participants).toHaveLength(1);
  });
});

describe("recordProcedureEventInputSchema", () => {
  it("accepts ROOM_IN and ROOM_OUT events (AC-F-07-1)", () => {
    const roomIn = recordProcedureEventInputSchema.parse({ type: "ROOM_IN", recordedAt: new Date().toISOString() });
    expect(roomIn.type).toBe("ROOM_IN");
    const roomOut = recordProcedureEventInputSchema.parse({ type: "ROOM_OUT", note: "PACU transfer" });
    expect(roomOut.type).toBe("ROOM_OUT");
    expect(roomOut.note).toBe("PACU transfer");
  });

  it("accepts legacy milestone events with 'at' field", () => {
    const scopeIn = recordProcedureEventInputSchema.parse({ type: "SCOPE_IN", at: new Date().toISOString() });
    expect(scopeIn.type).toBe("SCOPE_IN");
  });

  it("rejects unknown event types", () => {
    expect(recordProcedureEventInputSchema.safeParse({ type: "PATIENT_COUGHED" }).success).toBe(false);
  });
});

describe("assignScopeInputSchema", () => {
  const validScope = {
    scopeSerial: "OLY-GIF-190-8832",
    scopeModel: "Olympus GIF-H190",
    reprocessedAt: "2026-10-15T08:00:00.000Z",
    leakTestResult: "PASS" as const,
    cycleOutcome: "PASS" as const,
  };

  it("accepts valid scope assignment payload", () => {
    const parsed = assignScopeInputSchema.parse(validScope);
    expect(parsed.scopeSerial).toBe("OLY-GIF-190-8832");
    expect(parsed.leakTestResult).toBe("PASS");
  });

  it("rejects invalid leak test or cycle outcome", () => {
    expect(assignScopeInputSchema.safeParse({ ...validScope, leakTestResult: "MAYBE" }).success).toBe(false);
  });

  it("rejects invalid ISO timestamp", () => {
    expect(assignScopeInputSchema.safeParse({ ...validScope, reprocessedAt: "not-a-date" }).success).toBe(false);
  });
});

describe("gate2OverrideInputSchema", () => {
  const validOverride = {
    reason: "Patient has dedicated private transport arranged and verified with attending physician.",
    actorName: "Dr. Gregory House, MD",
    actorRole: "gi-physician",
  };

  it("accepts valid Gate 2 override reason >= 10 chars", () => {
    expect(gate2OverrideInputSchema.parse(validOverride).reason).toContain("dedicated private transport");
  });

  it("rejects override reason with fewer than 10 characters", () => {
    expect(gate2OverrideInputSchema.safeParse({ ...validOverride, reason: "urgent" }).success).toBe(false);
  });

  it("rejects override reason exceeding 500 characters", () => {
    expect(gate2OverrideInputSchema.safeParse({ ...validOverride, reason: "a".repeat(501) }).success).toBe(false);
  });

  it("rejects missing actorName", () => {
    expect(gate2OverrideInputSchema.safeParse({ reason: "Valid reason for override >= 10 chars" }).success).toBe(false);
  });
});
