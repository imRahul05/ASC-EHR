import { computeOverallReadiness, isCaseStage, medHoldCheck, nextPhase, PHASE_LABEL, timeOutGate } from "@asc/clinical-rules";
import type {
  AuditActor,
  ClinicalTimelineEvent,
  CaseDetail,
  CasePhase,
  CaseStage,
  Gate2OverrideRecord,
  PatientListItem,
  ProcedureCase,
  Room,
  ScopeAssignmentRecord,
  StaffRef,
  WorkItem,
} from "@asc/types";
import { createSeedState } from "./seed";
import { ROOMS, STAFF_LIST } from "./staff";
import { newId, patientRef } from "./util";

/**
 * In-memory demo database (dev only). Lives in the browser tab: a full reload re-seeds it,
 * `resetDb()` (POST /demo/reset) re-seeds on demand. All data is synthetic.
 */
let state = createSeedState();

interface CaseFinancialRecord {
  eligibilityStatus?: "active" | "inactive" | "incomplete" | "error";
  collectedCents: number;
  paymentPlanActive: boolean;
  priorAuth?: {
    authNumber: string;
    status: "approved" | "denied" | "pending" | "not_required";
    validFrom: string;
    validTo: string;
    approvedCptCodes: readonly string[];
    approvedUnits: number;
  };
}

const financialRecords = new Map<string, CaseFinancialRecord>();
const scopeAssignments = new Map<string, ScopeAssignmentRecord>();
const gate2Overrides = new Map<string, Gate2OverrideRecord>();

export function getCaseFinancial(caseId: string): CaseFinancialRecord {
  let record = financialRecords.get(caseId);
  if (!record) {
    const current = state.cases.get(caseId);
    const patient = current ? state.patients.get(current.patientId) : null;
    const isInactive = patient?.lastName?.toLowerCase().includes("inactive") || patient?.coverage?.eligibility?.status === "inactive";
    record = {
      eligibilityStatus: isInactive ? "inactive" : "active",
      collectedCents: 0,
      paymentPlanActive: false,
      priorAuth: {
        authNumber: "AUTH-DEMO-01",
        status: "approved",
        validFrom: "2024-01-01",
        validTo: "2026-12-31",
        approvedCptCodes: ["45378", "45380", "45385", "43235", "43239"],
        approvedUnits: 1,
      },
    };
    financialRecords.set(caseId, record);
  }
  return record;
}

export function updateCaseFinancial(caseId: string, patch: Partial<CaseFinancialRecord>): CaseFinancialRecord {
  const current = getCaseFinancial(caseId);
  const updated = { ...current, ...patch };
  financialRecords.set(caseId, updated);
  return updated;
}

export function getScopeAssignment(caseId: string): ScopeAssignmentRecord | null {
  return scopeAssignments.get(caseId) ?? null;
}

export function setScopeAssignment(caseId: string, record: ScopeAssignmentRecord): void {
  scopeAssignments.set(caseId, record);
}

export function getGate2Override(caseId: string): Gate2OverrideRecord | null {
  return gate2Overrides.get(caseId) ?? null;
}

export function setGate2Override(caseId: string, record: Gate2OverrideRecord): void {
  gate2Overrides.set(caseId, record);
}

export function db() {
  return state;
}

export function resetDb(): void {
  state = createSeedState();
  financialRecords.clear();
  scopeAssignments.clear();
  gate2Overrides.clear();
}

// ─── Actor (from the mock bearer token) ─────────────────────────────────────

interface Actor extends AuditActor {
  readonly ref: StaffRef;
}

const TOKEN_USER_ID = /(usr_[a-z0-9]+(?:_\d+)?)_\d+$/;
const FALLBACK_ACTOR: Actor = { id: "usr_unknown", name: "Demo user", role: "ADMIN", ref: { id: "usr_unknown", name: "Demo user", initials: "DU" } };

/** Who is calling: the demo token embeds the user id (`mock_demo_jwt_<userId>_<ts>`). */
export function actorFrom(request: Request): Actor {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/, "") ?? "";
  const userId = TOKEN_USER_ID.exec(token)?.[1];
  if (userId === "usr_patient_01") {
    return { id: userId, name: "Robert Miller", role: "PATIENT", ref: { id: userId, name: "Robert Miller", initials: "RM" } };
  }
  const member = STAFF_LIST.find((staff) => staff.id === userId);
  if (!member) return FALLBACK_ACTOR;
  return { id: member.id, name: member.name, role: member.role, ref: { id: member.id, name: member.name, initials: member.initials } };
}

export function userIdFrom(request: Request): string | undefined {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/, "") ?? "";
  return TOKEN_USER_ID.exec(token)?.[1];
}

// ─── Audit & work items (side effects of commands) ──────────────────────────

export function audit(
  actor: AuditActor,
  action: string,
  entity: ClinicalTimelineEvent["entity"],
  summary: string,
  outcome: ClinicalTimelineEvent["outcome"] = "success",
): void {
  const { id, name, role } = actor;
  state.audit = [
    { id: newId("aud"), at: new Date().toISOString(), actor: { id, name, role }, action, entity, summary, outcome },
    ...state.audit,
  ];
}

export function addWorkItem(item: Omit<WorkItem, "id" | "status" | "createdAt">): void {
  const exists = state.workItems.some(
    (existing) => existing.status === "open" && existing.type === item.type && existing.caseId === item.caseId && existing.referralId === item.referralId,
  );
  if (exists) return;
  state.workItems = [{ ...item, id: newId("wi"), status: "open", createdAt: new Date().toISOString() }, ...state.workItems];
}

export function completeWorkItems(match: (item: WorkItem) => boolean): void {
  const completedAt = new Date().toISOString();
  state.workItems = state.workItems.map((item) => (item.status === "open" && match(item) ? { ...item, status: "done", completedAt } : item));
}

// ─── Cases ──────────────────────────────────────────────────────────────────

export function getCaseOrNull(caseId: string): ProcedureCase | null {
  return state.cases.get(caseId) ?? null;
}

export function updateCase(caseId: string, patch: Partial<ProcedureCase>): void {
  const current = state.cases.get(caseId);
  if (current) state.cases.set(caseId, { ...current, ...patch });
}

/** Recomputes derived readiness flags from the records (the API keeps these current). */
export function refreshReadiness(caseId: string): void {
  const current = state.cases.get(caseId);
  const patient = current && state.patients.get(current.patientId);
  if (!current || !patient) return;
  const hp = state.hp.get(caseId);
  const consents = state.consents.get(caseId) ?? [];
  const timeOut = state.timeOut.get(caseId);
  const consentsSigned = consents.length > 0 && consents.every((consent) => consent.status === "signed");
  const hpSigned = hp?.status === "signed";
  const escortConfirmed = patient.escort?.confirmed ?? false;

  let nextChecks = current.readinessChecks;
  if (nextChecks) {
    nextChecks = nextChecks.map((check) => {
      if (check.name === "consent" && check.status !== "failed" && check.status !== "waived") {
        return consentsSigned ? { ...check, status: "satisfied" } : check;
      }
      if (check.name === "hp" && check.status !== "waived") {
        return hpSigned ? { ...check, status: "satisfied" } : check;
      }
      if (check.name === "escort" && check.status !== "waived") {
        return escortConfirmed ? { ...check, status: "satisfied" } : check;
      }
      return check;
    });
  }

  state.cases.set(caseId, {
    ...current,
    patient: patientRef(patient),
    ...(hp?.asa ? { asa: hp.asa } : {}),
    readiness: {
      ...current.readiness,
      eligibilityActive: patient.coverage?.eligibility?.status === "active",
      hpCurrent: hpSigned,
      asaSet: hp?.asa != null,
      consentsSigned,
      holdsConfirmed: (hp?.holdsReviewed ?? false) && medHoldCheck(patient.medications).ok,
      escortConfirmed,
      timeOutComplete: timeOut ? timeOutGate(timeOut).ok : false,
    },
    ...(nextChecks ? { readinessChecks: nextChecks, overallReadiness: computeOverallReadiness(nextChecks) } : {}),
  });
}

const STAGE_TO_PHASE: Readonly<Record<CaseStage, CasePhase>> = {
  requested: "SCHEDULED",
  scheduled: "SCHEDULED",
  confirmed: "CONFIRMED",
  arrived: "ARRIVED",
  preop: "PRE_OP",
  in_room: "READY_FOR_PROCEDURE",
  procedure_start: "IN_PROCEDURE",
  procedure_end: "IN_PROCEDURE",
  pacu: "RECOVERY",
  discharged: "DISCHARGED",
  cancelled: "CANCELLED",
  no_show: "NO_SHOW",
};

const PHASE_TO_STAGE: Readonly<Record<CasePhase, CaseStage>> = {
  SCHEDULED: "scheduled",
  CONFIRMED: "confirmed",
  ARRIVED: "arrived",
  PRE_OP: "preop",
  READY_FOR_PROCEDURE: "in_room",
  IN_PROCEDURE: "procedure_start",
  RECOVERY: "pacu",
  READY_FOR_DISCHARGE: "pacu",
  DISCHARGED: "discharged",
  CHART_COMPLETE: "discharged",
  CODED: "discharged",
  EXPORTED: "discharged",
  CLOSED: "discharged",
  CANCELLED: "cancelled",
  NO_SHOW: "no_show",
};

export function phaseFromStage(stage: CaseStage): CasePhase {
  return STAGE_TO_PHASE[stage];
}

export function resolveTarget(target?: string | null): {
  readonly canonicalTarget: CasePhase | CaseStage;
  readonly stage: CaseStage;
  readonly phase: CasePhase;
} {
  const trimmed = (target ?? "").trim();
  const normalized = trimmed.toLowerCase().replaceAll("-", "_");
  if (isCaseStage(normalized as CasePhase | CaseStage)) {
    const stage = normalized as CaseStage;
    return {
      canonicalTarget: stage,
      stage,
      phase: STAGE_TO_PHASE[stage],
    };
  }

  const upper = trimmed.toUpperCase().replaceAll("-", "_");
  if (Object.hasOwn(PHASE_TO_STAGE, upper)) {
    const phase = upper as CasePhase;
    return {
      canonicalTarget: phase,
      stage: PHASE_TO_STAGE[phase],
      phase,
    };
  }

  return {
    canonicalTarget: trimmed as CasePhase | CaseStage,
    stage: "scheduled",
    phase: "SCHEDULED",
  };
}

export function setPhase(caseId: string, target: CasePhase | CaseStage, actor: AuditActor, reason?: string): void {
  const current = state.cases.get(caseId);
  if (!current) return;

  const { canonicalTarget, stage: targetStage, phase: targetPhase } = resolveTarget(String(target));
  const now = new Date().toISOString();

  state.cases.set(caseId, {
    ...current,
    phase: targetPhase,
    stage: targetStage,
    timestamps: { ...current.timestamps, [targetPhase]: now },
    stageTimestamps: { ...current.stageTimestamps, [targetStage]: now },
    ...(reason && (targetPhase === "CANCELLED" || targetPhase === "NO_SHOW") ? { cancelReason: reason } : {}),
  });
  const fromLabel = PHASE_LABEL[current.phase] ?? current.phase;
  const toLabel = isCaseStage(canonicalTarget) ? canonicalTarget : (PHASE_LABEL[canonicalTarget] ?? canonicalTarget);
  audit(actor, "case.transition", { type: "ProcedureCase", id: caseId }, `${current.caseNumber} ${fromLabel} → ${toLabel}`);
}

/** Post-procedure phases advance on their own when the underlying work is done (sign → code → export). */
const AUTO_ADVANCE: Partial<Record<CasePhase, (detail: CaseDetail) => boolean>> = {
  DISCHARGED: (detail) => detail.summary.noteStatus === "signed",
  CHART_COMPLETE: (detail) => detail.summary.codingStatus === "attested" || detail.summary.codingStatus === "exported",
  CODED: (detail) => detail.summary.codingStatus === "exported",
};

export function autoAdvance(caseId: string, actor: AuditActor): void {
  for (;;) {
    const detail = caseDetail(caseId);
    const next = detail && nextPhase(detail.case.phase);
    if (!detail || !next || !AUTO_ADVANCE[detail.case.phase]?.(detail)) return;
    setPhase(caseId, next, actor);
  }
}

export function caseDetail(caseId: string): CaseDetail | null {
  const procedureCase = state.cases.get(caseId);
  const patient = procedureCase && state.patients.get(procedureCase.patientId);
  if (!procedureCase || !patient) return null;
  const specimens = state.specimens.get(caseId) ?? [];
  return {
    case: procedureCase,
    patient,
    hp: state.hp.get(caseId) ?? null,
    consents: state.consents.get(caseId) ?? [],
    vitals: state.vitals.get(caseId) ?? [],
    timeOut: state.timeOut.get(caseId) ?? {
      caseId,
      checklist: {
        patientIdentity: false,
        procedureConfirmed: false,
        consentVerified: false,
        allergiesReviewed: false,
        equipmentReady: false,
        anticoagulationReviewed: false,
      },
      attestations: [],
    },
    events: state.events.get(caseId) ?? [],
    narration: state.narration.get(caseId) ?? [],
    specimens,
    images: state.images.get(caseId) ?? [],
    anesthesia: state.anesthesia.get(caseId) ?? {
      caseId,
      provider: procedureCase.team.anesthesia,
      technique: "MAC",
      airway: { device: "nasal_cannula", o2Lpm: 2 },
      airwayEvents: [],
      doses: [],
      vitals: [],
    },
    aldrete: state.aldrete.get(caseId) ?? null,
    discharge: state.discharge.get(caseId) ?? null,
    summary: {
      noteStatus: state.notes.get(caseId)?.status ?? "none",
      codingStatus: state.coding.get(caseId)?.status ?? "not_ready",
      specimensPending: specimens.filter((specimen) => specimen.pathologyStatus === "pending").length,
      surveillanceSet: state.surveillance.has(caseId),
      lettersSent: state.letters.get(caseId)?.length ?? 0,
    },
    scopeAssignment: scopeAssignments.get(caseId) ?? null,
    gate2Override: gate2Overrides.get(caseId) ?? null,
  };
}

// ─── Rooms & lists ──────────────────────────────────────────────────────────

const TURNOVER_MS = 15 * 60_000;

/** Room status derived from today's cases. */
export function roomsNow(): Room[] {
  const cases = [...state.cases.values()];
  const now = Date.now();
  return ROOMS.map((room) => {
    const inRoom = cases.find((item) => item.roomId === room.id && item.phase === "IN_PROCEDURE");
    if (inRoom) return { ...room, status: "in_use", currentCaseId: inRoom.id };
    const justLeft = cases.some(
      (item) => item.roomId === room.id && item.timestamps.RECOVERY && now - Date.parse(item.timestamps.RECOVERY) < TURNOVER_MS,
    );
    return { ...room, status: justLeft ? "turnover" : "idle" };
  });
}

export function patientListItem(patientId: string): PatientListItem | null {
  const patient = state.patients.get(patientId);
  if (!patient) return null;
  const now = Date.now();
  const next = [...state.cases.values()]
    .filter((item) => item.patientId === patientId && !["CANCELLED", "NO_SHOW"].includes(item.phase))
    .filter((item) => Date.parse(item.scheduledStart) + item.durationMin * 60_000 >= now - 12 * 3_600_000)
    .sort((a, b) => Date.parse(a.scheduledStart) - Date.parse(b.scheduledStart))[0];
  return {
    ...patientRef(patient),
    phone: patient.phone,
    payer: patient.coverage?.payer,
    eligibility: patient.coverage?.eligibility?.status,
    allergyCount: patient.allergies.length,
    ...(next ? { nextCaseId: next.id, nextCaseStart: next.scheduledStart } : {}),
  };
}
