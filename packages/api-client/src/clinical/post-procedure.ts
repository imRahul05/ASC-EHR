import { API_ROUTES } from "@asc/config/api";
import type {
  CaseCoding,
  CaseDetail,
  CasePathology,
  ChargeExport,
  DischargeCasePayload,
  DischargeInstructions,
  ExportChargesPayload,
  RecordPathologyPayload,
  ReconcilePathologyPayload,
  SaveAldretePayload,
  SendResultLetterPayload,
  SetSurveillancePayload,
  UpdateCodingStatusPayload,
} from "@asc/types";
import { http } from "../http";

// ─── Recovery & discharge ───────────────────────────────────────────────────

export function saveAldrete(caseId: string, payload: SaveAldretePayload): Promise<CaseDetail> {
  return http.post(API_ROUTES.caseAldrete(caseId), payload);
}

/** AI draft of discharge instructions (status `draft`, with provenance). */
export function generateDischargeInstructions(caseId: string): Promise<DischargeInstructions> {
  return http.post(API_ROUTES.caseDischargeInstructions(caseId));
}

/** Clinician approval (instructions become visible in the patient portal). */
export function approveDischargeInstructions(caseId: string): Promise<DischargeInstructions> {
  return http.post(API_ROUTES.caseDischargeInstructionsApprove(caseId));
}

/** READY_FOR_DISCHARGE → DISCHARGED (finalDischargeGate re-checked server-side). */
export function dischargeCase(caseId: string, payload: DischargeCasePayload): Promise<CaseDetail> {
  return http.post(API_ROUTES.caseDischarge(caseId), payload);
}

// ─── Coding & charges ───────────────────────────────────────────────────────

export function getCoding(caseId: string): Promise<CaseCoding> {
  return http.get(API_ROUTES.caseCoding(caseId));
}

export function updateCodingStatus(caseId: string, payload: UpdateCodingStatusPayload): Promise<CaseCoding> {
  return http.post(API_ROUTES.caseCodingStatus(caseId), payload);
}

/** Coder attestation. Requires a signed note and every suggestion reviewed. */
export function attestCoding(caseId: string): Promise<CaseCoding> {
  return http.post(API_ROUTES.caseCodingAttest(caseId));
}

export function exportCharges(caseId: string, payload: ExportChargesPayload): Promise<ChargeExport> {
  return http.post(API_ROUTES.caseChargesExport(caseId), payload);
}

// ─── Pathology & surveillance ───────────────────────────────────────────────

export function getPathology(caseId: string): Promise<CasePathology> {
  return http.get(API_ROUTES.casePathology(caseId));
}

/** Records a (mock) lab result for one specimen. */
export function recordPathologyResult(caseId: string, payload: RecordPathologyPayload): Promise<CasePathology> {
  return http.post(API_ROUTES.casePathologyResults(caseId), payload);
}

/** Links a result to its note finding / polyp. */
export function reconcilePathology(caseId: string, payload: ReconcilePathologyPayload): Promise<CasePathology> {
  return http.post(API_ROUTES.casePathologyReconcile(caseId), payload);
}

export function setSurveillance(caseId: string, payload: SetSurveillancePayload): Promise<CasePathology> {
  return http.put(API_ROUTES.caseSurveillance(caseId), payload);
}

export function sendResultLetter(caseId: string, payload: SendResultLetterPayload): Promise<CasePathology> {
  return http.post(API_ROUTES.caseLetters(caseId), payload);
}
