import type {
  CaseDetail,
  CasePhase,
  CaseStage,
  ReadinessCheck,
  ReadinessCheckName,
  ReadinessCheckStatus,
} from "@asc/types";
import { describe, expect, it } from "vitest";
import {
  evaluateGate1,
  evaluateGate2,
  evaluateScopeHangTime,
  SCOPE_HANG_TIME_HOURS,
  transitionGate,
} from "./gates";

function check(
  name: ReadinessCheckName,
  status: ReadinessCheckStatus,
  overrides: {
    readonly label?: string;
    readonly details?: string;
    readonly waivedBy?: string;
    readonly waivedAt?: string;
    readonly waiverReason?: string;
  } = {},
): ReadinessCheck {
  return {
    name,
    status,
    label: overrides.label ?? name,
    details: overrides.details,
    waivedBy: overrides.waivedBy,
    waivedAt: overrides.waivedAt,
    waiverReason: overrides.waiverReason,
  };
}

function mockCaseDetail(overrides: {
  readonly stage?: CaseStage;
  readonly phase?: CasePhase;
  readonly readinessChecks?: readonly ReadinessCheck[];
}): CaseDetail {
  return {
    case: {
      id: "case-1",
      caseNumber: "CASE-001",
      patientId: "p-1",
      patient: {
        id: "p-1",
        mrn: "MRN-1",
        displayName: "Jane Doe",
        initials: "JD",
        age: 46,
        sex: "F",
        dateOfBirth: "1980-01-01",
      },
      procedure: "COLONOSCOPY",
      procedureLabel: "Colonoscopy",
      intent: "screening",
      indication: "Routine screening",
      roomId: "OR-1",
      scheduledStart: "2026-10-15T08:00:00.000Z",
      durationMin: 30,
      team: {
        surgeon: { id: "s-1", name: "Dr. Smith", initials: "DS" },
        nurse: { id: "s-2", name: "Nurse Jones", initials: "NJ" },
        anesthesia: { id: "s-3", name: "Dr. Anes", initials: "DA" },
      },
      phase: overrides.phase ?? "PRE_OP",
      stage: overrides.stage ?? "arrived",
      timestamps: {},
      readiness: {
        prepConfirmed: true,
        eligibilityActive: true,
        hpCurrent: true,
        asaSet: true,
        consentsSigned: true,
        holdsConfirmed: true,
        escortConfirmed: true,
        npoConfirmed: true,
        ivPlaced: true,
        timeOutComplete: false,
      },
      readinessChecks: overrides.readinessChecks,
    },
    patient: {
      id: "p-1",
      mrn: "MRN-1",
      firstName: "Jane",
      lastName: "Doe",
      dateOfBirth: "1980-01-01",
      sex: "F",
      phone: "555-0100",
      preferredLanguage: "en",
      coverage: {
        id: "cov-1",
        payer: "Blue Cross",
        planName: "PPO",
        memberId: "MEM-1",
        subscriberRelationship: "self",
        eligibility: null,
      },
      escort: null,
      allergies: [],
      medications: [],
      createdAt: "2026-10-01T00:00:00.000Z",
    },
    hp: null,
    consents: [],
    vitals: [],
    timeOut: {
      caseId: "case-1",
      checklist: {
        patientIdentity: true,
        procedureConfirmed: true,
        consentVerified: true,
        allergiesReviewed: true,
        equipmentReady: true,
        anticoagulationReviewed: true,
      },
      attestations: [],
    },
    events: [],
    narration: [],
    specimens: [],
    images: [],
    anesthesia: {
      caseId: "case-1",
      provider: { id: "s-3", name: "Dr. Anes", initials: "DA" },
      technique: "MAC",
      airway: { device: "nasal_cannula", o2Lpm: 2 },
      airwayEvents: [],
      doses: [],
      vitals: [],
    },
    discharge: null,
    aldrete: null,
    summary: {
      noteStatus: "none",
      codingStatus: "not_ready",
      specimensPending: 0,
      surveillanceSet: false,
      lettersSent: 0,
    },
  };
}

describe("Hard Gate 1 (arrived ➔ preop)", () => {
  it("passes when identity, consent, and hp are satisfied", () => {
    const checks: readonly ReadinessCheck[] = [
      check("identity", "satisfied"),
      check("consent", "satisfied"),
      check("hp", "satisfied"),
    ];

    const result = evaluateGate1(checks);
    expect(result.ok).toBe(true);
    expect(result.reasons).toHaveLength(0);
    expect(result.checks).toHaveLength(3);
    expect(result.checks?.every((c) => c.ok)).toBe(true);
  });

  it("passes when hp is waived with a valid reason", () => {
    const checks: readonly ReadinessCheck[] = [
      check("identity", "satisfied"),
      check("consent", "satisfied"),
      check("hp", "waived", {
        waivedBy: "Dr. Smith",
        waiverReason: "Exam confirmed verbally; written chart update pending",
      }),
    ];

    const result = evaluateGate1(checks);
    expect(result.ok).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("blocks when consent is missing", () => {
    const checks: readonly ReadinessCheck[] = [
      check("identity", "satisfied"),
      check("hp", "satisfied"),
    ];

    const result = evaluateGate1(checks);
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.code === "GATE1_CONSENT")).toBe(true);
  });

  it("blocks when identity or hp is missing", () => {
    const missingIdentity: readonly ReadinessCheck[] = [
      check("consent", "satisfied"),
      check("hp", "satisfied"),
    ];
    expect(evaluateGate1(missingIdentity).ok).toBe(false);

    const missingHp: readonly ReadinessCheck[] = [
      check("identity", "satisfied"),
      check("consent", "satisfied"),
    ];
    expect(evaluateGate1(missingHp).ok).toBe(false);
  });

  it("rejects any waiver on consent per REQ-5:202", () => {
    const checks: readonly ReadinessCheck[] = [
      check("identity", "satisfied"),
      check("consent", "waived", {
        waivedBy: "Admin User",
        waiverReason: "Urgent procedure requested by family",
      }),
      check("hp", "satisfied"),
    ];

    const result = evaluateGate1(checks);
    expect(result.ok).toBe(false);
    const reason = result.reasons.find((r) => r.code === "GATE1_CONSENT");
    expect(reason).toBeDefined();
    expect(reason?.message).toContain("cannot be waived");
  });

  it("rejects any waiver on identity per REQ-5:202", () => {
    const checks: readonly ReadinessCheck[] = [
      check("identity", "waived", {
        waivedBy: "Admin User",
        waiverReason: "Unconscious emergency arrival",
      }),
      check("consent", "satisfied"),
      check("hp", "satisfied"),
    ];

    const result = evaluateGate1(checks);
    expect(result.ok).toBe(false);
    const reason = result.reasons.find((r) => r.code === "GATE1_IDENTITY");
    expect(reason).toBeDefined();
    expect(reason?.message).toContain("cannot be waived");
  });
});

describe("Hard Gate 2 (preop ➔ in_room)", () => {
  it("passes when anesthesia, anticoagulation, equipment, and escort are satisfied", () => {
    const checks: readonly ReadinessCheck[] = [
      check("anesthesia_clearance", "satisfied"),
      check("anticoagulation", "satisfied"),
      check("equipment", "satisfied"),
      check("escort", "satisfied"),
    ];

    const result = evaluateGate2(checks);
    expect(result.ok).toBe(true);
    expect(result.reasons).toHaveLength(0);
    expect(result.checks).toHaveLength(4);
    expect(result.checks?.every((c) => c.ok)).toBe(true);
  });

  it("blocks when escort is missing", () => {
    const checks: readonly ReadinessCheck[] = [
      check("anesthesia_clearance", "satisfied"),
      check("anticoagulation", "satisfied"),
      check("equipment", "satisfied"),
    ];

    const result = evaluateGate2(checks);
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.code === "GATE2_ESCORT")).toBe(true);
  });

  it("blocks when anesthesia is missing", () => {
    const checks: readonly ReadinessCheck[] = [
      check("anticoagulation", "satisfied"),
      check("equipment", "satisfied"),
      check("escort", "satisfied"),
    ];

    const result = evaluateGate2(checks);
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.code === "GATE2_ANESTHESIA")).toBe(true);
  });

  it("blocks when any required check is pending or failed", () => {
    const withPending: readonly ReadinessCheck[] = [
      check("anesthesia_clearance", "pending"),
      check("anticoagulation", "satisfied"),
      check("equipment", "satisfied"),
      check("escort", "satisfied"),
    ];
    expect(evaluateGate2(withPending).ok).toBe(false);

    const withFailed: readonly ReadinessCheck[] = [
      check("anesthesia_clearance", "satisfied"),
      check("anticoagulation", "failed", { details: "Warfarin hold day 1 of 5" }),
      check("equipment", "satisfied"),
      check("escort", "satisfied"),
    ];
    const failedResult = evaluateGate2(withFailed);
    expect(failedResult.ok).toBe(false);
    expect(failedResult.reasons.some((r) => r.code === "GATE2_ANTICOAGULATION")).toBe(true);
  });
});

describe("Scope Hang-Time Lock (equipment)", () => {
  const procedureTime = "2026-10-15T12:00:00.000Z";

  it("permits scope at 167 hours (within 168-hour limit)", () => {
    const procedureMs = new Date(procedureTime).getTime();
    const reprocessed167 = new Date(procedureMs - 167 * 3600 * 1000).toISOString();

    const result = evaluateScopeHangTime(reprocessed167, procedureTime);
    expect(result.ok).toBe(true);
    expect(result.reasons).toHaveLength(0);
    expect(result.checks?.[0]?.ok).toBe(true);
  });

  it("permits scope at exactly 168 hours", () => {
    const procedureMs = new Date(procedureTime).getTime();
    const reprocessed168 = new Date(procedureMs - SCOPE_HANG_TIME_HOURS * 3600 * 1000).toISOString();

    const result = evaluateScopeHangTime(reprocessed168, procedureTime);
    expect(result.ok).toBe(true);
  });

  it("blocks and locks out at 169 hours with 0 overrides permitted", () => {
    const procedureMs = new Date(procedureTime).getTime();
    const reprocessed169 = new Date(procedureMs - 169 * 3600 * 1000).toISOString();

    const result = evaluateScopeHangTime(reprocessed169, procedureTime);
    expect(result.ok).toBe(false);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]?.code).toBe("SCOPE_HANG_TIME_EXCEEDED");
    expect(result.reasons[0]?.message).toBe(
      "Scope hang-time exceeded 168 hours. Must return to sterile processing.",
    );
  });

  it("handles invalid date strings gracefully", () => {
    const result = evaluateScopeHangTime("invalid-date", procedureTime);
    expect(result.ok).toBe(false);
    expect(result.reasons[0]?.code).toBe("INVALID_TIMESTAMP");
  });
});

describe("transitionGate integration", () => {
  it("runs Gate 1 for transition to preop", () => {
    const passingChecks: readonly ReadinessCheck[] = [
      check("identity", "satisfied"),
      check("consent", "satisfied"),
      check("hp", "satisfied"),
    ];

    const passingDetail = mockCaseDetail({
      stage: "arrived",
      readinessChecks: passingChecks,
    });
    expect(transitionGate(passingDetail, "preop").ok).toBe(true);

    const failingDetail = mockCaseDetail({
      stage: "arrived",
      readinessChecks: [check("identity", "satisfied")],
    });
    const failingResult = transitionGate(failingDetail, "preop");
    expect(failingResult.ok).toBe(false);
    expect(failingResult.reasons.some((r) => r.code === "GATE1_CONSENT")).toBe(true);
  });

  it("runs Gate 2 for transition to in_room", () => {
    const passingChecks: readonly ReadinessCheck[] = [
      check("anesthesia_clearance", "satisfied"),
      check("anticoagulation", "satisfied"),
      check("equipment", "satisfied"),
      check("escort", "satisfied"),
    ];

    const passingDetail = mockCaseDetail({
      stage: "preop",
      readinessChecks: passingChecks,
    });
    expect(transitionGate(passingDetail, "in_room").ok).toBe(true);

    const failingDetail = mockCaseDetail({
      stage: "preop",
      readinessChecks: [
        check("anesthesia_clearance", "satisfied"),
        check("anticoagulation", "satisfied"),
      ],
    });
    const failingResult = transitionGate(failingDetail, "in_room");
    expect(failingResult.ok).toBe(false);
    expect(failingResult.reasons.some((r) => r.code === "GATE2_EQUIPMENT")).toBe(true);
  });
});
