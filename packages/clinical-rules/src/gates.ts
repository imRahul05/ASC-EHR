import type {
  AldreteInput,
  AldreteScore,
  CaseDetail,
  CasePhase,
  CaseStage,
  Consent,
  DischargeInstructions,
  HpAssessment,
  Medication,
  NoteDraft,
  Patient,
  ProcedureCase,
  ProcedureEvent,
  ReadinessCheck,
  ReadinessCheckName,
  RuleResult,
  TimeOutRecord,
  TimeOutRole,
} from "@asc/types";
import { medHoldCheck } from "./meds";
import { transitionAllowed } from "./phases";
import { combine, fail, fromChecks, OK } from "./result";
import { ALDRETE_COMPONENTS } from "./scores";

/** Minimum modified Aldrete total for discharge (and no component may be 0). */
export const ALDRETE_DISCHARGE_MIN = 9;
export const TIME_OUT_ROLES: readonly TimeOutRole[] = ["SURGEON", "NURSE", "ANESTHESIOLOGIST"];
export const TIME_OUT_ROLE_LABEL: Readonly<Record<TimeOutRole, string>> = {
  SURGEON: "Surgeon",
  NURSE: "Nurse",
  ANESTHESIOLOGIST: "Anesthesia",
};

/** SCHEDULED → CONFIRMED: insurance eligibility verified. */
export function confirmGate(patient: Pick<Patient, "coverage">): RuleResult {
  const status = patient.coverage?.eligibility?.status;
  return fromChecks([
    {
      code: "ELIGIBILITY_ACTIVE",
      label: "Eligibility verified (270/271)",
      ok: status === "active",
      message: status ? `Eligibility is ${status}; re-check coverage.` : "Run an eligibility check before confirming.",
    },
  ]);
}

/** PRE_OP → READY_FOR_PROCEDURE: H&P current, ASA set, consents signed, holds confirmed, escort, NPO. */
export function readinessGate(
  procedureCase: Pick<ProcedureCase, "readiness">,
  hp: HpAssessment | null,
  consents: readonly Consent[],
  medications: readonly Medication[] = [],
): RuleResult {
  const holds = medHoldCheck(medications);
  const unsigned = consents.filter((consent) => consent.status !== "signed");
  return fromChecks([
    { code: "HP_CURRENT", label: "H&P signed today", ok: hp?.status === "signed", message: "Sign the H&P." },
    { code: "ASA_SET", label: "ASA class recorded", ok: hp?.asa != null, message: "Record the ASA class." },
    {
      code: "CONSENTS_SIGNED",
      label: "Consents signed",
      ok: consents.length > 0 && unsigned.length === 0,
      message:
        consents.length === 0 ? "No consents on file." : `Unsigned consent: ${unsigned.map((c) => c.title).join(", ")}.`,
    },
    {
      code: "HOLDS_CONFIRMED",
      label: "Medication holds confirmed",
      ok: (hp?.holdsReviewed ?? false) && holds.ok,
      message: holds.reasons[0]?.message ?? "Review medication holds in the H&P.",
    },
    {
      code: "ESCORT_CONFIRMED",
      label: "Escort confirmed",
      ok: procedureCase.readiness.escortConfirmed,
      message: "Confirm an adult escort for discharge.",
    },
    { code: "NPO_CONFIRMED", label: "NPO confirmed", ok: procedureCase.readiness.npoConfirmed, message: "Confirm NPO status." },
  ]);
}

/** READY_FOR_PROCEDURE → IN_PROCEDURE: multi-role time-out attested and checklist complete. */
export function timeOutGate(timeOut: TimeOutRecord): RuleResult {
  const attested = new Set(timeOut.attestations.map((item) => item.role));
  const checklistOk = Object.values(timeOut.checklist).every(Boolean);
  return fromChecks([
    { code: "TIMEOUT_CHECKLIST", label: "Time-out checklist complete", ok: checklistOk, message: "Complete every time-out item." },
    ...TIME_OUT_ROLES.map((role) => ({
      code: `TIMEOUT_${role}`,
      label: `${TIME_OUT_ROLE_LABEL[role]} attested`,
      ok: attested.has(role),
      message: `Time-out not yet attested by ${TIME_OUT_ROLE_LABEL[role].toLowerCase()}.`,
    })),
  ]);
}

/** IN_PROCEDURE → RECOVERY: scope out recorded. */
export function procedureEndGate(events: readonly ProcedureEvent[]): RuleResult {
  return fromChecks([
    {
      code: "SCOPE_OUT",
      label: "Scope out recorded",
      ok: events.some((event) => event.type === "SCOPE_OUT"),
      message: "Record scope out before ending the procedure.",
    },
  ]);
}

/** RECOVERY → READY_FOR_DISCHARGE: Aldrete ≥ 9 with no zero component, escort present. */
export function dischargeGate(aldrete: (AldreteInput & { readonly total: number }) | null, escortPresent: boolean): RuleResult {
  const zeros = aldrete ? ALDRETE_COMPONENTS.filter((key) => aldrete[key] === 0) : [];
  return fromChecks([
    {
      code: "ALDRETE_MIN",
      label: `Aldrete ≥ ${ALDRETE_DISCHARGE_MIN}`,
      ok: aldrete !== null && aldrete.total >= ALDRETE_DISCHARGE_MIN,
      message: aldrete ? `Aldrete is ${aldrete.total}; needs ≥ ${ALDRETE_DISCHARGE_MIN}.` : "Record an Aldrete score.",
    },
    {
      code: "ALDRETE_NO_ZERO",
      label: "No Aldrete component scored 0",
      ok: aldrete !== null && zeros.length === 0,
      message: zeros.length > 0 ? `Component scored 0: ${zeros.join(", ")}.` : "Record an Aldrete score.",
    },
    { code: "ESCORT_PRESENT", label: "Escort present", ok: escortPresent, message: "An adult escort must be present." },
  ]);
}

/** READY_FOR_DISCHARGE → DISCHARGED: discharge gate + approved instructions. */
export function finalDischargeGate(
  aldrete: AldreteScore | null,
  escortPresent: boolean,
  instructions: DischargeInstructions | null,
): RuleResult {
  return combine(
    dischargeGate(aldrete, escortPresent),
    fromChecks([
      {
        code: "INSTRUCTIONS_APPROVED",
        label: "Discharge instructions approved",
        ok: instructions?.status === "approved",
        message: instructions ? "Approve the discharge instructions." : "Generate and approve discharge instructions.",
      },
    ]),
  );
}

/** A note may be signed only as a draft with no unresolved blocking gap-chip. */
export function signGate(note: NoteDraft | null): RuleResult {
  const blocking = note?.gapChips.filter((chip) => chip.blocking && !chip.resolved) ?? [];
  return fromChecks([
    { code: "NOTE_EXISTS", label: "Note generated", ok: note !== null, message: "Generate the procedure note first." },
    {
      code: "NOTE_IS_DRAFT",
      label: "Note is a completed draft",
      ok: note?.status === "draft",
      message: note?.status === "signed" ? "Note is already signed." : "Wait for the draft to finish.",
    },
    {
      code: "NO_BLOCKING_GAPS",
      label: "No blocking gaps",
      ok: note !== null && blocking.length === 0,
      message: blocking.length > 0 ? `Resolve ${blocking.length} blocking gap(s): ${blocking[0]?.message ?? ""}` : "Generate the note first.",
    },
  ]);
}

/**
 * Hard Gate 1 (arrived ➔ preop): evaluated when moving from Lobby to Pre-Op.
 * Evaluates the 3 required checks per REQ-5 §204–210: identity, consent, and hp.
 * Rejects transition if any of these 3 checks are not satisfied (or waived).
 * Critical Rule (REQ-5 §202): identity and consent can NEVER be waived or overridden.
 */
export function evaluateGate1(checks: readonly ReadinessCheck[]): RuleResult {
  const checkByName = new Map<ReadinessCheckName, ReadinessCheck>();
  for (const c of checks) {
    checkByName.set(c.name, c);
  }

  const identity = checkByName.get("identity");
  const consent = checkByName.get("consent");
  const hp = checkByName.get("hp");

  // identity cannot be waived; must be satisfied
  const identityWaived = identity?.status === "waived";
  const identitySatisfied = identity?.status === "satisfied";
  const identityOk = identitySatisfied && !identityWaived;
  const identityMsg = !identity
    ? "Identity verification is missing."
    : identityWaived
      ? "Identity check cannot be waived or overridden."
      : identityOk
        ? ""
        : identity.details ?? "Identity verification is not satisfied.";

  // consent cannot be waived; must be satisfied
  const consentWaived = consent?.status === "waived";
  const consentSatisfied = consent?.status === "satisfied";
  const consentOk = consentSatisfied && !consentWaived;
  const consentMsg = !consent
    ? "Informed consent is missing."
    : consentWaived
      ? "Consent cannot be waived or overridden."
      : consentOk
        ? ""
        : consent.details ?? "Informed consent is not satisfied.";

  // hp can be satisfied or waived
  const hpOk = hp?.status === "satisfied" || hp?.status === "waived";
  const hpMsg = !hp
    ? "H&P assessment is missing."
    : hpOk
      ? ""
      : hp.details ?? "H&P assessment within 30 days is not satisfied.";

  return fromChecks([
    {
      code: "GATE1_IDENTITY",
      label: "Patient identity verified",
      ok: Boolean(identityOk),
      message: identityMsg,
    },
    {
      code: "GATE1_CONSENT",
      label: "Informed consent signed",
      ok: Boolean(consentOk),
      message: consentMsg,
    },
    {
      code: "GATE1_HP",
      label: "H&P valid within 30 days",
      ok: Boolean(hpOk),
      message: hpMsg,
    },
  ]);
}

/**
 * Hard Gate 2 (preop ➔ in_room): evaluated when rolling gurney into Procedure Room / OR.
 * Evaluates the 4 required checks per REQ-5 §204–210: anesthesia_clearance, anticoagulation, equipment, and escort.
 * Rejects entry into the OR if any of these 4 checks are pending or failed.
 */
export function evaluateGate2(checks: readonly ReadinessCheck[]): RuleResult {
  const checkByName = new Map<ReadinessCheckName, ReadinessCheck>();
  for (const c of checks) {
    checkByName.set(c.name, c);
  }

  const anesthesia = checkByName.get("anesthesia_clearance");
  const anticoagulation = checkByName.get("anticoagulation");
  const equipment = checkByName.get("equipment");
  const escort = checkByName.get("escort");

  const anesthesiaOk = anesthesia?.status === "satisfied" || anesthesia?.status === "waived";
  const anticoagulationOk = anticoagulation?.status === "satisfied" || anticoagulation?.status === "waived";
  const equipmentOk = equipment?.status === "satisfied" || equipment?.status === "waived";
  const escortOk = escort?.status === "satisfied" || escort?.status === "waived";

  return fromChecks([
    {
      code: "GATE2_ANESTHESIA",
      label: "Anesthesia clearance complete",
      ok: Boolean(anesthesiaOk),
      message: !anesthesia
        ? "Anesthesia clearance is missing."
        : anesthesiaOk
          ? ""
          : anesthesia.details ?? `Anesthesia clearance is ${anesthesia.status}.`,
    },
    {
      code: "GATE2_ANTICOAGULATION",
      label: "Anticoagulation hold verified",
      ok: Boolean(anticoagulationOk),
      message: !anticoagulation
        ? "Anticoagulation hold verification is missing."
        : anticoagulationOk
          ? ""
          : anticoagulation.details ?? `Anticoagulation hold is ${anticoagulation.status}.`,
    },
    {
      code: "GATE2_EQUIPMENT",
      label: "Equipment and scope ready",
      ok: Boolean(equipmentOk),
      message: !equipment
        ? "Equipment readiness check is missing."
        : equipmentOk
          ? ""
          : equipment.details ?? `Equipment readiness is ${equipment.status}.`,
    },
    {
      code: "GATE2_ESCORT",
      label: "Responsible escort confirmed",
      ok: Boolean(escortOk),
      message: !escort
        ? "Responsible adult escort confirmation is missing."
        : escortOk
          ? ""
          : escort.details ?? `Responsible escort check is ${escort.status}.`,
    },
  ]);
}

/** Scope hang-time limit in hours per ASGE/SGNA guidelines [REQ-13]. */
export const SCOPE_HANG_TIME_HOURS = 168;

/**
 * Scope Hang-Time Lock (equipment):
 * Per ASGE/SGNA guidelines ([REQ-13]), reprocessed endoscopes hanging in cabinets expire after 168 hours (7 days).
 * If reprocessedAt was more than 168 hours before procedure date/time, the scope is EXPIRED.
 * Hard lockout: Zero overrides permitted. Scope must be rejected with status "failed", message:
 * "Scope hang-time exceeded 168 hours. Must return to sterile processing."
 */
export function evaluateScopeHangTime(reprocessedAt: string, procedureTime: string): RuleResult {
  const reprocessedMs = new Date(reprocessedAt).getTime();
  const procedureMs = new Date(procedureTime).getTime();

  if (Number.isNaN(reprocessedMs) || Number.isNaN(procedureMs)) {
    return fail("INVALID_TIMESTAMP", "Invalid timestamp provided for scope hang-time evaluation.");
  }

  const elapsedHours = (procedureMs - reprocessedMs) / (1000 * 60 * 60);
  const isExpired = elapsedHours > SCOPE_HANG_TIME_HOURS;

  return fromChecks([
    {
      code: "SCOPE_HANG_TIME_EXCEEDED",
      label: "Scope hang-time within 168 hours",
      ok: !isExpired,
      message: "Scope hang-time exceeded 168 hours. Must return to sterile processing.",
    },
  ]);
}

type GateFn = (detail: CaseDetail) => RuleResult;

/** Gate evaluated when a case moves INTO the key phase/stage (stop transitions have none). */
export const GATE_BY_TARGET: Partial<Record<CasePhase | CaseStage, GateFn>> = {
  CONFIRMED: (detail) => confirmGate(detail.patient),
  confirmed: (detail) => confirmGate(detail.patient),
  preop: (detail) => evaluateGate1(detail.case.readinessChecks ?? []),
  PRE_OP: (detail) => evaluateGate1(detail.case.readinessChecks ?? []),
  READY_FOR_PROCEDURE: (detail) =>
    readinessGate(detail.case, detail.hp, detail.consents, detail.patient.medications),
  in_room: (detail) => evaluateGate2(detail.case.readinessChecks ?? []),
  IN_PROCEDURE: (detail) => timeOutGate(detail.timeOut),
  procedure_start: (detail) => timeOutGate(detail.timeOut),
  RECOVERY: (detail) => procedureEndGate(detail.events),
  procedure_end: (detail) => procedureEndGate(detail.events),
  pacu: (detail) => procedureEndGate(detail.events),
  READY_FOR_DISCHARGE: (detail) => dischargeGate(detail.aldrete, detail.patient.escort?.present ?? false),
  DISCHARGED: (detail) =>
    finalDischargeGate(detail.aldrete, detail.patient.escort?.present ?? false, detail.discharge),
  discharged: (detail) =>
    finalDischargeGate(detail.aldrete, detail.patient.escort?.present ?? false, detail.discharge),
  CHART_COMPLETE: (detail) =>
    fromChecks([
      { code: "NOTE_SIGNED", label: "Procedure note signed", ok: detail.summary.noteStatus === "signed", message: "Sign the procedure note." },
    ]),
  CODED: (detail) =>
    fromChecks([
      {
        code: "CODING_ATTESTED",
        label: "Coding attested",
        ok: detail.summary.codingStatus === "attested" || detail.summary.codingStatus === "exported",
        message: "A coder must attest the codes.",
      },
    ]),
  EXPORTED: (detail) =>
    fromChecks([
      { code: "CHARGES_EXPORTED", label: "Charges exported", ok: detail.summary.codingStatus === "exported", message: "Export the charge file." },
    ]),
  CLOSED: (detail) =>
    fromChecks([
      {
        code: "SPECIMENS_RESULTED",
        label: "All specimens resulted",
        ok: detail.summary.specimensPending === 0,
        message: `${detail.summary.specimensPending} specimen(s) still awaiting pathology.`,
      },
      { code: "SURVEILLANCE_SET", label: "Surveillance interval set", ok: detail.summary.surveillanceSet, message: "Set the surveillance interval." },
      { code: "LETTER_SENT", label: "Result letter sent", ok: detail.summary.lettersSent > 0, message: "Send the result letter." },
    ]),
};

/** Full check for moving a case to `to`: state machine + the target phase's gate. */
export function transitionGate(detail: CaseDetail, to: CasePhase | CaseStage): RuleResult {
  const current = detail.case.stage ?? detail.case.phase;
  const allowed = transitionAllowed(current, to);
  if (!allowed.ok) return allowed;
  return GATE_BY_TARGET[to]?.(detail) ?? OK;
}
