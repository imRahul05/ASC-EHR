import type { ProcedureCode, ProcedureIntent, Referral, ReferralFactField, Sex } from "@asc/types";
import { EMPTY_PATIENT_REGISTRATION, type PatientRegistrationFormData } from "@asc/validation/patient";

/**
 * View-model helpers: AI-extracted referral facts → form defaults. The clinician still reviews every field;
 * nothing is saved until they submit.
 */

export function factValue(referral: Referral, field: ReferralFactField): string {
  return referral.extractedFacts.find((fact) => fact.field === field)?.value.trim() ?? "";
}

/** `04/22/1967` / `1967-04-22` → `1967-04-22` ("" when unreadable). */
function isoDateOf(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) return "";
  const [, month = "", day = "", year = ""] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

const SEX_BY_WORD: Readonly<Record<string, Sex>> = { f: "F", female: "F", m: "M", male: "M", x: "X" };

function sexOf(value: string): Sex {
  const key = value.toLowerCase();
  return Object.hasOwn(SEX_BY_WORD, key) ? (SEX_BY_WORD[key] ?? "X") : "X";
}

/** Referral facts → registration form values (patient name split on the last space). */
export function registrationDefaultsFromReferral(referral: Referral): PatientRegistrationFormData {
  const name = factValue(referral, "patientName");
  const split = name.lastIndexOf(" ");
  return {
    ...EMPTY_PATIENT_REGISTRATION,
    firstName: split > 0 ? name.slice(0, split) : name,
    lastName: split > 0 ? name.slice(split + 1) : "",
    dateOfBirth: isoDateOf(factValue(referral, "dateOfBirth")),
    sex: sexOf(factValue(referral, "sex")),
    phone: factValue(referral, "phone"),
    payer: factValue(referral, "payer"),
    memberId: factValue(referral, "memberId"),
    referringProvider: factValue(referral, "referringProvider"),
    medications: factValue(referral, "medications"),
    allergies: factValue(referral, "allergies"),
  };
}

const PROCEDURE_KEYWORDS: readonly (readonly [RegExp, ProcedureCode])[] = [
  [/egd.*colonoscopy|colonoscopy.*egd|bidirectional/i, "EGD_COLONOSCOPY"],
  [/egd|upper endoscopy/i, "EGD"],
  [/sigmoidoscopy/i, "FLEX_SIG"],
  [/colonoscopy/i, "COLONOSCOPY"],
];

const INTENT_KEYWORDS: readonly (readonly [RegExp, ProcedureIntent])[] = [
  [/surveillance|history of|adenoma removed/i, "surveillance"],
  [/screening/i, "screening"],
];

/** Requested procedure / reason text → booking suggestions. */
export function bookingHintsFromReferral(referral: Referral) {
  const requested = factValue(referral, "requestedProcedure");
  const reason = factValue(referral, "reason");
  const text = `${requested} ${reason}`;
  return {
    procedure: PROCEDURE_KEYWORDS.find(([pattern]) => pattern.test(requested))?.[1] ?? "COLONOSCOPY",
    intent: INTENT_KEYWORDS.find(([pattern]) => pattern.test(text))?.[1] ?? "diagnostic",
    indication: reason,
  } satisfies { procedure: ProcedureCode; intent: ProcedureIntent; indication: string };
}
