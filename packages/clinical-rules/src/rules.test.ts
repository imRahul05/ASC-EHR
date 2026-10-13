import type {
  Consent,
  HpAssessment,
  Medication,
  NoteDraft,
  PathologyResult,
  ProcedureCase,
  ProcedureEvent,
  ReadinessCheck,
  ReadinessFlags,
} from "@asc/types";
import { describe, expect, it } from "vitest";
import {
  aldreteTotal,
  canWaiveCheck,
  computeOverallReadiness,
  dischargeGate,
  findScheduleConflicts,
  isCheckSatisfiedOrWaived,
  isStageReversal,
  mapReadinessChecks,
  medClassFor,
  medHoldCheck,
  nextPhase,
  nextStage,
  NON_WAIVABLE_CHECKS,
  PHASE_GROUP,
  PHASE_ORDER,
  readinessGate,
  signGate,
  STAGE_GROUP,
  STAGE_ORDER,
  surveillanceInterval,
  transitionAllowed,
  withdrawalMinutes,
} from "./index";

const STAFF = { id: "s1", name: "Dr. Demo", initials: "DD" };
const READY: ReadinessFlags = {
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
};

const HP: HpAssessment = {
  caseId: "c1",
  status: "signed",
  asa: 2,
  mallampati: 2,
  airwayNotes: "",
  heart: "",
  lungs: "",
  intervalHistory: "",
  holdsReviewed: true,
  brief: null,
};

const consent = (status: Consent["status"]): Consent => ({
  id: "k1",
  caseId: "c1",
  kind: "procedure",
  title: "Procedure consent",
  summary: "",
  status,
});

const med = (holdStatus: Medication["holdStatus"]): Medication => ({
  id: "m1",
  name: "Apixaban",
  dose: "5 mg",
  frequency: "BID",
  medClass: "anticoagulant",
  holdRule: { daysBefore: 2, instruction: "Hold 2 days", source: "demo" },
  holdStatus,
});

const event = (type: ProcedureEvent["type"], at: string): ProcedureEvent => ({ id: type, caseId: "c1", type, at, by: STAFF });

describe("phases and stages", () => {
  it("reflects the strictly sequential 12 CaseStage values and groups", () => {
    expect(PHASE_ORDER).toHaveLength(12);
    expect(STAGE_ORDER).toHaveLength(12);
    expect(STAGE_GROUP.in_room).toBe("procedure");
    expect(STAGE_GROUP.no_show).toBe("stopped");
    expect(PHASE_GROUP.IN_PROCEDURE).toBe("procedure");
  });

  it("allows forward stage transitions along the stage machine", () => {
    expect(transitionAllowed("preop", "in_room").ok).toBe(true);
    expect(transitionAllowed("scheduled", "procedure_start").ok).toBe(false);
    expect(transitionAllowed("discharged", "preop").ok).toBe(false);
    expect(nextStage("confirmed")).toBe("arrived");
    expect(nextStage("discharged")).toBeNull();
  });

  it("permits explicit logged stage reversals", () => {
    expect(transitionAllowed("in_room", "preop").ok).toBe(true);
    expect(isStageReversal("in_room", "preop")).toBe(true);
    expect(isStageReversal("preop", "in_room")).toBe(false);
    expect(transitionAllowed("pacu", "in_room").ok).toBe(true);
    expect(isStageReversal("pacu", "in_room")).toBe(true);
  });

  it("maintains backward compatibility with legacy phase transitions", () => {
    expect(transitionAllowed("PRE_OP", "READY_FOR_PROCEDURE").ok).toBe(true);
    expect(transitionAllowed("SCHEDULED", "IN_PROCEDURE").ok).toBe(false);
    expect(transitionAllowed("IN_PROCEDURE", "CANCELLED").ok).toBe(false);
    expect(nextPhase("CONFIRMED")).toBe("ARRIVED");
    expect(nextPhase("CLOSED")).toBeNull();
  });

  it("supports cross-transitions between legacy CasePhase and CaseStage seamlessly", () => {
    // Transition from legacy phase to new stage
    expect(transitionAllowed("ARRIVED", "preop").ok).toBe(true);
    expect(transitionAllowed("PRE_OP", "in_room").ok).toBe(true);
    expect(transitionAllowed("SCHEDULED", "procedure_start").ok).toBe(false);

    // Transition from new stage to legacy phase
    expect(transitionAllowed("arrived", "PRE_OP").ok).toBe(true);
    expect(transitionAllowed("in_room", "IN_PROCEDURE").ok).toBe(true);
  });
});

describe("readiness checks and waivers", () => {
  it("enforces that identity and consent can never be waived per REQ-5 §202", () => {
    expect(canWaiveCheck("identity")).toBe(false);
    expect(canWaiveCheck("consent")).toBe(false);
    expect(NON_WAIVABLE_CHECKS).toEqual(["identity", "consent"]);
    expect(canWaiveCheck("coverage")).toBe(true);
    expect(canWaiveCheck("prep")).toBe(true);
    expect(canWaiveCheck("equipment")).toBe(true);

    expect(isCheckSatisfiedOrWaived(undefined)).toBe(false);
    expect(isCheckSatisfiedOrWaived({ name: "identity", status: "satisfied", label: "ID" })).toBe(true);
    expect(isCheckSatisfiedOrWaived({ name: "identity", status: "waived", label: "ID" })).toBe(false);
    expect(isCheckSatisfiedOrWaived({ name: "hp", status: "waived", label: "HP" })).toBe(true);
    expect(isCheckSatisfiedOrWaived({ name: "hp", status: "pending", label: "HP" })).toBe(false);

    const mapped = mapReadinessChecks([
      { name: "identity", status: "satisfied", label: "ID" },
      { name: "consent", status: "satisfied", label: "Consent" },
    ]);
    expect(mapped.get("identity")?.status).toBe("satisfied");
    expect(mapped.get("consent")?.status).toBe("satisfied");
    expect(mapped.get("hp")).toBeUndefined();
  });

  it("computes overall readiness correctly per REQ-5 §200", () => {
    expect(computeOverallReadiness([])).toBe("pending");

    const allSatisfied: ReadinessCheck[] = [
      { name: "identity", status: "satisfied", label: "ID verified" },
      { name: "consent", status: "satisfied", label: "Consent signed" },
    ];
    expect(computeOverallReadiness(allSatisfied)).toBe("ready");

    const withWaived: ReadinessCheck[] = [
      { name: "identity", status: "satisfied", label: "ID verified" },
      { name: "prep", status: "waived", label: "Prep waived", waiverReason: "Emergency" },
    ];
    expect(computeOverallReadiness(withWaived)).toBe("ready");

    const withFailed: ReadinessCheck[] = [
      { name: "identity", status: "satisfied", label: "ID verified" },
      { name: "anticoagulation", status: "failed", label: "Hold pending" },
    ];
    expect(computeOverallReadiness(withFailed)).toBe("blocked");

    const withPending: ReadinessCheck[] = [
      { name: "identity", status: "satisfied", label: "ID verified" },
      { name: "escort", status: "pending", label: "Escort pending" },
    ];
    expect(computeOverallReadiness(withPending)).toBe("pending");

    const withIllegalIdentityWaiver: ReadinessCheck[] = [
      { name: "identity", status: "waived", label: "ID waived", waiverReason: "Emergency arrival" },
      { name: "consent", status: "satisfied", label: "Consent signed" },
    ];
    expect(computeOverallReadiness(withIllegalIdentityWaiver)).toBe("blocked");

    const withIllegalConsentWaiver: ReadinessCheck[] = [
      { name: "identity", status: "satisfied", label: "ID verified" },
      { name: "consent", status: "waived", label: "Consent waived", waiverReason: "Urgent" },
    ];
    expect(computeOverallReadiness(withIllegalConsentWaiver)).toBe("blocked");
  });
});

describe("readinessGate", () => {
  it("passes when every item is satisfied", () => {
    expect(readinessGate({ readiness: READY }, HP, [consent("signed")], [med("confirmed")]).ok).toBe(true);
  });

  it("lists every failing reason", () => {
    const result = readinessGate({ readiness: { ...READY, escortConfirmed: false } }, null, [consent("pending")], [med("pending")]);
    expect(result.ok).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toEqual([
      "HP_CURRENT",
      "ASA_SET",
      "CONSENTS_SIGNED",
      "HOLDS_CONFIRMED",
      "ESCORT_CONFIRMED",
    ]);
    expect(result.checks).toHaveLength(6);
  });
});

describe("medHoldCheck", () => {
  it("requires holds to be confirmed", () => {
    expect(medHoldCheck([med("pending")]).ok).toBe(false);
    expect(medHoldCheck([med("confirmed")]).ok).toBe(true);
  });
});

describe("medClassFor", () => {
  it("classifies referral medications so hold rules apply", () => {
    expect(medClassFor("warfarin")).toBe("anticoagulant");
    expect(medClassFor("Semaglutide")).toBe("glp1");
    expect(medClassFor("ferrous sulfate")).toBe("iron");
    expect(medClassFor("lisinopril")).toBe("other");
  });
});

describe("dischargeGate", () => {
  const score = { activity: 2, respiration: 2, circulation: 2, consciousness: 2, oxygenSaturation: 1 } as const;

  it("needs Aldrete ≥ 9, no zeros and an escort", () => {
    expect(aldreteTotal(score)).toBe(9);
    expect(dischargeGate({ ...score, total: 9 }, true).ok).toBe(true);
    expect(dischargeGate({ ...score, total: 9 }, false).ok).toBe(false);
    expect(dischargeGate({ ...score, oxygenSaturation: 0, total: 8 }, true).reasons).toHaveLength(2);
  });
});

describe("signGate", () => {
  const note = (blocking: boolean, resolved: boolean): NoteDraft => ({
    id: "n1",
    caseId: "c1",
    status: "draft",
    sections: [],
    findings: [],
    provenance: { agent: "procedure_note", promptVersion: "v1", generatedAt: "2026-01-01T00:00:00Z" },
    gapChips: [{ id: "g1", sectionId: "findings", message: "Polyp size missing", blocking, resolved }],
    criticSuggestions: [],
    version: 1,
  });

  it("blocks signing on unresolved blocking gap-chips", () => {
    expect(signGate(note(true, false)).ok).toBe(false);
    expect(signGate(note(true, true)).ok).toBe(true);
    expect(signGate(note(false, false)).ok).toBe(true);
    expect(signGate(null).ok).toBe(false);
  });
});

describe("withdrawalMinutes", () => {
  it("measures withdrawal start → scope out", () => {
    const events = [event("WITHDRAWAL_START", "2026-01-01T09:10:00Z"), event("SCOPE_OUT", "2026-01-01T09:18:30Z")];
    expect(withdrawalMinutes(events)).toBe(8.5);
    expect(withdrawalMinutes(events.slice(0, 1))).toBeNull();
  });
});

describe("surveillanceInterval", () => {
  const result = (histology: PathologyResult["histology"], sizeMm: number, isAdenoma: boolean): PathologyResult => ({
    id: histology,
    caseId: "c1",
    specimenId: "s",
    status: "received",
    receivedAt: "2026-01-01T00:00:00Z",
    histology,
    dysplasia: "none",
    isAdenoma,
    sizeMm,
    diagnosis: "",
    reportText: "",
  });

  it("follows the simplified USMSTF table", () => {
    expect(surveillanceInterval([]).intervalYears).toBe(10);
    expect(surveillanceInterval([result("tubular_adenoma", 6, true)]).intervalYears).toBe(7);
    expect(surveillanceInterval([result("tubular_adenoma", 6, true), result("sessile_serrated_lesion", 5, false)]).intervalYears).toBe(5);
    expect(surveillanceInterval([result("tubular_adenoma", 12, true)]).intervalYears).toBe(3);
  });
});

describe("findScheduleConflicts", () => {
  const existing: ProcedureCase = {
    id: "c1",
    caseNumber: "C-1",
    patientId: "p1",
    patient: { id: "p1", mrn: "MRN-1", displayName: "Demo Patient", initials: "DP", age: 45, sex: "M", dateOfBirth: "1980-01-01" },
    procedure: "COLONOSCOPY",
    procedureLabel: "Colonoscopy",
    intent: "screening",
    indication: "Screening colonoscopy",
    roomId: "room-1",
    scheduledStart: "2026-01-01T09:00:00Z",
    durationMin: 30,
    phase: "CONFIRMED",
    team: { surgeon: STAFF, anesthesia: { ...STAFF, id: "a1" }, nurse: { ...STAFF, id: "n1" } },
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
  };
  const proposed = {
    patientId: "p2",
    roomId: "room-1",
    scheduledStart: "2026-01-01T09:15:00Z",
    durationMin: 30,
    surgeonId: "s2",
    anesthesiaId: "a2",
    nurseId: "n2",
  };

  it("detects room overlap and ignores back-to-back slots", () => {
    expect(findScheduleConflicts([existing], proposed).conflicts.map((c) => c.kind)).toEqual(["room"]);
    expect(findScheduleConflicts([existing], { ...proposed, scheduledStart: "2026-01-01T09:30:00Z" }).ok).toBe(true);
  });
});
