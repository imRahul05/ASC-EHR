import type { Identifier } from "@medplum/fhirtypes";
import { type FhirUrls, fhirUrls } from "@asc/fhir/urls";

/**
 * Identifier systems and helpers. Values are PHI (MRN, eCW patient id): errors name the field and never
 * echo the value, and nothing here logs.
 */

/** eCW patient ids are per practice: the system is `urn:wybit:ecw:<practice>` (docs/product/06 §5.1). */
export const ECW_SYSTEM_PREFIX = "urn:wybit:ecw:";

// An opaque id: no whitespace or control characters, bounded. The exact eCW practice id format is
// unconfirmed (06 §7), so this accepts letters, digits, "_" and "-" only.
const PRACTICE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const VALUE = /^[^\s\p{Cc}]{1,64}$/u;

function value(raw: string, field: string): string {
  if (!VALUE.test(raw)) throw new Error(`invalid ${field}`);
  return raw;
}

export function ecwPatientSystem(practice: string): string {
  if (!PRACTICE.test(practice)) throw new Error("invalid eCW practice id");
  return `${ECW_SYSTEM_PREFIX}${practice}`;
}

/** The eCW patient id of a patient, so ASC EHR and MindScript resolve the same person without sharing a database. */
export function ecwPatientIdentifier(practice: string, patientId: string): Identifier {
  return { system: ecwPatientSystem(practice), value: value(patientId, "eCW patient id") };
}

export function mrnIdentifier(mrn: string, urls: FhirUrls = fhirUrls): Identifier {
  return { system: urls.identifierSystem("mrn"), value: value(mrn, "MRN") };
}

export function caseNumberIdentifier(caseNumber: string, urls: FhirUrls = fhirUrls): Identifier {
  return { system: urls.identifierSystem("case-number"), value: value(caseNumber, "case number") };
}

export interface CaseNumberParts {
  /** Short facility code, upper-case letters and digits. */
  readonly facilityCode: string;
  /** Date of the case as `YYYY-MM-DD` (a string, so no time zone can shift it). */
  readonly date: string;
  /** Running number within that facility and day, starting at 1. */
  readonly sequence: number;
}

/**
 * `<facility>-<yyyymmdd>-<seq>` (default of P03 Q2, confirmation in issue #55; changing it before data exists
 * is free). The date makes it closer to a date of service than an opaque id, so treat it as sensitive: it is
 * not logged with a patient name and URLs carry the internal id.
 */
export function formatCaseNumber({ facilityCode, date, sequence }: CaseNumberParts): string {
  if (!/^[A-Z0-9]{2,8}$/.test(facilityCode)) throw new Error("invalid facility code");
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (day === null || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error("invalid case date");
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9999) throw new Error("invalid case sequence");
  return `${facilityCode}-${day[1]}${day[2]}${day[3]}-${String(sequence).padStart(4, "0")}`;
}
