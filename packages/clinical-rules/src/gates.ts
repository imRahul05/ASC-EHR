import type {
  AldreteInput,
  AldreteScore,
  CaseDetail,
  CasePhase,
  Consent,
  DischargeInstructions,
  HpAssessment,
  Medication,
  NoteDraft,
  Patient,
  ProcedureCase,
  ProcedureEvent,
  RuleResult,
  TimeOutRecord,
  TimeOutRole,
} from "@asc/types";
import { medHoldCheck } from "./meds";
import { transitionAllowed } from "./phases";
import { combine, fromChecks, OK } from "./result";
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

type GateFn = (detail: CaseDetail) => RuleResult;

/** Gate evaluated when a case moves INTO the key phase (stop transitions have none). */
export const GATE_BY_TARGET: Partial<Record<CasePhase, GateFn>> = {
  CONFIRMED: (detail) => confirmGate(detail.patient),
  READY_FOR_PROCEDURE: (detail) =>
    readinessGate(detail.case, detail.hp, detail.consents, detail.patient.medications),
  IN_PROCEDURE: (detail) => timeOutGate(detail.timeOut),
  RECOVERY: (detail) => procedureEndGate(detail.events),
  READY_FOR_DISCHARGE: (detail) => dischargeGate(detail.aldrete, detail.patient.escort?.present ?? false),
  DISCHARGED: (detail) =>
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
export function transitionGate(detail: CaseDetail, to: CasePhase): RuleResult {
  const allowed = transitionAllowed(detail.case.phase, to);
  if (!allowed.ok) return allowed;
  return GATE_BY_TARGET[to]?.(detail) ?? OK;
}
