import { medHoldCheck, nextPhase, PHASE_LABEL, timeOutGate } from "@asc/clinical-rules";
import type {
  AuditActor,
  AuditEvent,
  CaseDetail,
  CasePhase,
  PatientListItem,
  ProcedureCase,
  Room,
  StaffRef,
  UserRole,
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

export function db() {
  return state;
}

export function resetDb(): void {
  state = createSeedState();
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
  entity: AuditEvent["entity"],
  summary: string,
  outcome: AuditEvent["outcome"] = "success",
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
  state.cases.set(caseId, {
    ...current,
    patient: patientRef(patient),
    ...(hp?.asa ? { asa: hp.asa } : {}),
    readiness: {
      ...current.readiness,
      eligibilityActive: patient.coverage?.eligibility?.status === "active",
      hpCurrent: hp?.status === "signed",
      asaSet: hp?.asa != null,
      consentsSigned: consents.length > 0 && consents.every((consent) => consent.status === "signed"),
      holdsConfirmed: (hp?.holdsReviewed ?? false) && medHoldCheck(patient.medications).ok,
      escortConfirmed: patient.escort?.confirmed ?? false,
      timeOutComplete: timeOut ? timeOutGate(timeOut).ok : false,
    },
  });
}

export function setPhase(caseId: string, phase: CasePhase, actor: AuditActor, reason?: string): void {
  const current = state.cases.get(caseId);
  if (!current) return;
  state.cases.set(caseId, {
    ...current,
    phase,
    timestamps: { ...current.timestamps, [phase]: new Date().toISOString() },
    ...(reason && (phase === "CANCELLED" || phase === "NO_SHOW") ? { cancelReason: reason } : {}),
  });
  audit(actor, "case.transition", { type: "ProcedureCase", id: caseId }, `${current.caseNumber} ${PHASE_LABEL[current.phase]} → ${PHASE_LABEL[phase]}`);
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

export function isStaffRole(role: UserRole | "SYSTEM"): role is Exclude<UserRole, "PATIENT"> {
  return role !== "PATIENT" && role !== "SYSTEM";
}
