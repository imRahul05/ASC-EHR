import { API_ROUTES } from "@asc/config/api";
import type {
  AddImagePayload,
  AddProcedureEventPayload,
  AddSpecimenPayload,
  AnesthesiaEntryPayload,
  AttestTimeOutPayload,
  BbpsScore,
  BookCasePayload,
  CaseDetail,
  CheckInPayload,
  ConflictCheckResult,
  ConsentRecord,
  HpDetailResponse,
  IsoDate,
  PreopAssessmentResult,
  ProcedureCase,
  SaveHpPayload,
  SavePreOpPayload,
  SaveVitalsPayload,
  ScheduleDay,
  SignConsentPayload,
  SignConsentResult,
  SubmitAnticoagulationResult,
  SubmitHpOverrideResult,
  SubmitHpUpdateResult,
  TransitionCasePayload,
} from "@asc/types";
import type { AnticoagulationAssessmentInput } from "@asc/validation/anticoagulation";
import type { BookCaseInput, BookCaseResult } from "@asc/validation/cases/book";
import type { SignConsentInput } from "@asc/validation/consent";
import type { HpOverrideInput, HpUpdateNoteInput } from "@asc/validation/hp";
import type { PreopAssessmentInput } from "@asc/validation/preop";
import { http } from "../http";

export type BookCaseResponse = BookCaseResult & Partial<ProcedureCase>;

// ─── Schedule ───────────────────────────────────────────────────────────────

/** Day board: rooms + cases on `date` (`YYYY-MM-DD`, default today), optionally scoped by `facilityId`. */
export function getSchedule(date?: IsoDate, facilityId?: string): Promise<ScheduleDay> {
  const query: Record<string, string> = {};
  if (date) query.date = date;
  const trimmed = facilityId?.trim();
  if (trimmed) query.facilityId = trimmed;
  return http.get(API_ROUTES.schedule, {
    query: Object.keys(query).length > 0 ? query : undefined,
    headers: trimmed ? { "x-facility-id": trimmed } : undefined,
  });
}

/** Server-side conflict check for a proposed booking (UI also runs findScheduleConflicts locally). */
export function checkScheduleConflicts(payload: BookCasePayload): Promise<ConflictCheckResult> {
  return http.post(API_ROUTES.scheduleConflicts, payload);
}

/** Books a case into an operating room (POST /cases). Rejects 409 conflict with structured reasons in `details` and `reasons`. */
export function bookCase(payload: BookCaseInput | BookCasePayload): Promise<BookCaseResponse> {
  const headers = payload.idempotencyKey ? { "x-idempotency-key": payload.idempotencyKey } : undefined;
  return http.post(API_ROUTES.cases, payload, { headers });
}

// ─── Case workspace ─────────────────────────────────────────────────────────
// Every command returns the refreshed CaseDetail so hooks can write it straight into the cache.
// Gate violations reject with ApiError 409/422 and `code` (e.g. GATE_FAILED) + `details` (reason code → message).

export function getCase(caseId: string, facilityId?: string): Promise<CaseDetail> {
  const trimmed = facilityId?.trim();
  return http.get(API_ROUTES.case(caseId), {
    query: trimmed ? { facilityId: trimmed } : undefined,
    headers: trimmed ? { "x-facility-id": trimmed } : undefined,
  });
}

export function transitionCase(caseId: string, payload: TransitionCasePayload, facilityId?: string): Promise<CaseDetail> {
  const trimmed = facilityId?.trim();
  return http.post(API_ROUTES.caseTransition(caseId), payload, {
    query: trimmed ? { facilityId: trimmed } : undefined,
    headers: trimmed ? { "x-facility-id": trimmed } : undefined,
  });
}

/** CONFIRMED → ARRIVED (records escort presence / NPO). */
export function checkInCase(caseId: string, payload: CheckInPayload): Promise<CaseDetail> {
  return http.post(API_ROUTES.caseCheckIn(caseId), payload);
}

export function saveHp(caseId: string, payload: SaveHpPayload): Promise<CaseDetail> {
  return http.put(API_ROUTES.caseHp(caseId), payload);
}

/** Pre-op readiness toggles: NPO, IV, escort confirmed/present, prep confirmed. */
export function savePreOp(caseId: string, payload: SavePreOpPayload): Promise<CaseDetail> {
  return http.patch(API_ROUTES.casePreOp(caseId), payload);
}

export function saveVitals(caseId: string, payload: SaveVitalsPayload): Promise<CaseDetail> {
  return http.post(API_ROUTES.caseVitals(caseId), payload);
}

export function signConsent(
  caseId: string,
  payload: SignConsentInput,
  facilityId?: string,
): Promise<SignConsentResult>;
export function signConsent(
  caseId: string,
  payload: SignConsentPayload,
  facilityId?: string,
): Promise<CaseDetail>;
export function signConsent(
  caseId: string,
  payload: SignConsentInput | SignConsentPayload,
  facilityId?: string,
): Promise<SignConsentResult | CaseDetail> {
  const trimmed = facilityId?.trim();
  if ("consentFormVersion" in payload) {
    return http.post(API_ROUTES.caseConsent(caseId), payload, {
      query: trimmed ? { facilityId: trimmed } : undefined,
      headers: trimmed ? { "x-facility-id": trimmed } : undefined,
    });
  }
  return http.post(API_ROUTES.caseConsentSign(caseId), payload, {
    query: trimmed ? { facilityId: trimmed } : undefined,
    headers: trimmed ? { "x-facility-id": trimmed } : undefined,
  });
}

export function getConsent(caseId: string, facilityId?: string): Promise<ConsentRecord | null> {
  const trimmed = facilityId?.trim();
  return http.get(API_ROUTES.caseConsent(caseId), {
    query: trimmed ? { facilityId: trimmed } : undefined,
    headers: trimmed ? { "x-facility-id": trimmed } : undefined,
  });
}

export function submitPreopAssessment(
  caseId: string,
  payload: PreopAssessmentInput,
  facilityId?: string,
): Promise<PreopAssessmentResult> {
  const trimmed = facilityId?.trim();
  return http.post(API_ROUTES.casePreopAssessment(caseId), payload, {
    query: trimmed ? { facilityId: trimmed } : undefined,
    headers: trimmed ? { "x-facility-id": trimmed } : undefined,
  });
}

/** One role's time-out attestation; the case is timeOutComplete once all three roles attest. */
export function attestTimeOut(caseId: string, payload: AttestTimeOutPayload): Promise<CaseDetail> {
  return http.post(API_ROUTES.caseTimeOut(caseId), payload);
}

export function addProcedureEvent(caseId: string, payload: AddProcedureEventPayload): Promise<CaseDetail> {
  return http.post(API_ROUTES.caseEvents(caseId), payload);
}

export function recordBbps(caseId: string, payload: BbpsScore): Promise<CaseDetail> {
  return http.put(API_ROUTES.caseBbps(caseId), payload);
}

/** Append one mock speech-to-text line to the room transcript. */
export function addNarration(caseId: string, payload: { readonly speaker: string; readonly text: string }): Promise<CaseDetail> {
  return http.post(API_ROUTES.caseNarration(caseId), payload);
}

export function addSpecimen(caseId: string, payload: AddSpecimenPayload): Promise<CaseDetail> {
  return http.post(API_ROUTES.caseSpecimens(caseId), payload);
}

export function addImage(caseId: string, payload: AddImagePayload): Promise<CaseDetail> {
  return http.post(API_ROUTES.caseImages(caseId), payload);
}

/** AIMS flowsheet entry: dose, vitals row, airway event, sedation start/end, or setup. */
export function addAnesthesiaEntry(caseId: string, payload: AnesthesiaEntryPayload): Promise<CaseDetail> {
  return http.post(API_ROUTES.caseAnesthesia(caseId), payload);
}

export function submitHpUpdate(
  caseId: string,
  payload: HpUpdateNoteInput,
  facilityId?: string,
): Promise<SubmitHpUpdateResult> {
  const trimmed = facilityId?.trim();
  return http.post(API_ROUTES.caseHpUpdate(caseId), payload, {
    query: trimmed ? { facilityId: trimmed } : undefined,
    headers: trimmed ? { "x-facility-id": trimmed } : undefined,
  });
}

export function submitHpOverride(
  caseId: string,
  payload: HpOverrideInput,
  facilityId?: string,
): Promise<SubmitHpOverrideResult> {
  const trimmed = facilityId?.trim();
  return http.post(API_ROUTES.caseHpOverride(caseId), payload, {
    query: trimmed ? { facilityId: trimmed } : undefined,
    headers: trimmed ? { "x-facility-id": trimmed } : undefined,
  });
}

export function submitAnticoagulation(
  caseId: string,
  payload: AnticoagulationAssessmentInput,
  facilityId?: string,
): Promise<SubmitAnticoagulationResult> {
  const trimmed = facilityId?.trim();
  return http.post(API_ROUTES.caseAnticoagulation(caseId), payload, {
    query: trimmed ? { facilityId: trimmed } : undefined,
    headers: trimmed ? { "x-facility-id": trimmed } : undefined,
  });
}

export function getHpDetail(caseId: string, facilityId?: string): Promise<HpDetailResponse> {
  const trimmed = facilityId?.trim();
  return http.get(API_ROUTES.caseHp(caseId), {
    query: trimmed ? { facilityId: trimmed } : undefined,
    headers: trimmed ? { "x-facility-id": trimmed } : undefined,
  });
}

export {
  checkCaseEligibility,
  collectCopay,
  getFinancialSummary,
  recordPriorAuth,
} from "./financial";


