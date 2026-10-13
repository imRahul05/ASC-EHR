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
  RegisterPatientResult,
  UpdateEscortPayload,
} from "@asc/types";
import type { RegisterPatientInput } from "@asc/validation/patients/register";
import type { PatientSearchBodyInput } from "@asc/validation/patients/search";
import { http, toQuery } from "../http";

function computeAge(birthDate: string): number {
  if (!birthDate) return 0;
  const parsed = new Date(birthDate);
  if (Number.isNaN(parsed.getTime())) return 0;
  const now = new Date();
  let age = now.getUTCFullYear() - parsed.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - parsed.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < parsed.getUTCDate())) {
    age--;
  }
  return Math.max(0, age);
}

interface RawFhirPatient {
  readonly resourceType?: string;
  readonly id?: string;
  readonly identifier?: readonly { readonly system?: string; readonly value?: string }[];
  readonly name?: readonly { readonly family?: string; readonly given?: readonly string[] }[];
  readonly birthDate?: string;
  readonly gender?: string;
  readonly telecom?: readonly { readonly system?: string; readonly value?: string }[];
}

interface PatientSearchObjectResponse {
  readonly total: number;
  readonly patients: readonly (PatientListItem | RawFhirPatient)[];
}

type SearchResponsePayload = readonly PatientListItem[] | PatientSearchObjectResponse;

function toPatientListItem(item: PatientListItem | RawFhirPatient): PatientListItem {
  if ("displayName" in item && "mrn" in item) {
    return item;
  }
  const given = item.name?.[0]?.given?.[0] ?? "";
  const family = item.name?.[0]?.family ?? "";
  const displayName = `${given} ${family}`.trim() || "Unknown";
  const initials = `${given[0] ?? ""}${family[0] ?? ""}`.toUpperCase() || "U";
  const mrn = item.identifier?.find((id) => id.system?.includes("mrn") || !id.system)?.value ?? "";
  const sex = item.gender === "female" ? "F" : item.gender === "male" ? "M" : "X";
  const birthDate = item.birthDate ?? "";
  const phone = item.telecom?.find((t) => t.system === "phone")?.value ?? "";

  return {
    id: item.id ?? "",
    mrn,
    displayName,
    initials,
    age: computeAge(birthDate),
    sex,
    dateOfBirth: birthDate,
    phone,
    allergyCount: 0,
  };
}

// ─── Patients ───────────────────────────────────────────────────────────────

/** List / search patients (name, MRN, DOB `YYYY-MM-DD`, phone) via GET /patients. */
export function listPatients(query: PatientSearchQuery = {}): Promise<readonly PatientListItem[]> {
  return http.get(API_ROUTES.patients, { query: toQuery(query) });
}

/** PHI-safe search patients via POST /patients/search (no demographic data in query string). */
export async function searchPatients(payload: PatientSearchBodyInput = {}): Promise<readonly PatientListItem[]> {
  const res = await http.post<SearchResponsePayload>(API_ROUTES.patientsSearch, payload);
  if (Array.isArray(res)) {
    return res.map(toPatientListItem);
  }
  if (res && "patients" in res && Array.isArray(res.patients)) {
    return res.patients.map(toPatientListItem);
  }
  return [];
}

/** Register patient with duplicate detection and atomic FHIR bundle creation via POST /patients/register. */
export function registerPatient(payload: RegisterPatientInput): Promise<RegisterPatientResult> {
  return http.post(API_ROUTES.patientsRegister, payload);
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
