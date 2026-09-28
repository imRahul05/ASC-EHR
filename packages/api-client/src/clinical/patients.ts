import { API_ROUTES } from "@asc/config/api";
import type {
  ConvertReferralPayload,
  ConvertReferralResult,
  CreatePatientPayload,
  DuplicateCheckPayload,
  DuplicateCheckResult,
  EligibilityResult,
  Patient,
  PatientListItem,
  PatientSearchQuery,
  Referral,
  UpdateEscortPayload,
} from "@asc/types";
import { http, toQuery } from "../http";

// ─── Patients ───────────────────────────────────────────────────────────────

/** List / search patients (name, MRN, DOB `YYYY-MM-DD`, phone). */
export function listPatients(query: PatientSearchQuery = {}): Promise<readonly PatientListItem[]> {
  return http.get(API_ROUTES.patients, { query: toQuery(query) });
}

export function getPatient(patientId: string): Promise<Patient> {
  return http.get(API_ROUTES.patient(patientId));
}

export function createPatient(payload: CreatePatientPayload): Promise<Patient> {
  return http.post(API_ROUTES.patients, payload);
}

export function checkDuplicatePatient(payload: DuplicateCheckPayload): Promise<DuplicateCheckResult> {
  return http.post(API_ROUTES.patientDuplicateCheck, payload);
}

/** Mock X12 270/271 eligibility check; updates the patient's coverage. */
export function checkEligibility(patientId: string): Promise<EligibilityResult> {
  return http.post(API_ROUTES.patientEligibility(patientId));
}

export function updateEscort(patientId: string, payload: UpdateEscortPayload): Promise<Patient> {
  return http.put(API_ROUTES.patientEscort(patientId), payload);
}

// ─── Referrals (fax inbox) ──────────────────────────────────────────────────

export function listReferrals(): Promise<readonly Referral[]> {
  return http.get(API_ROUTES.referrals);
}

export function getReferral(referralId: string): Promise<Referral> {
  return http.get(API_ROUTES.referral(referralId));
}

/** Link the referral to an existing patient or create one from extracted facts. */
export function convertReferral(referralId: string, payload: ConvertReferralPayload): Promise<ConvertReferralResult> {
  return http.post(API_ROUTES.referralConvert(referralId), payload);
}
