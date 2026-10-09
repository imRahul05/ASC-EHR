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
  /** Calendar year of the case, 2000 to 2099 (we only mint numbers for new cases; imports keep their own ids). */
  readonly year: number;
  /** Running number within that facility and year, starting at 1. */
  readonly sequence: number;
}

/**
 * `<facility>-<yyyy>-<seq>` (P03 Q2, decided in issue #55). The year replaces the full date so the date of
 * service is not spelled out on the whiteboard, in URLs or in logs. The number is still a HIPAA identifier
 * whatever its format (a unique identifying code, Safe Harbor §164.514(b)(2)(i)(R)): never log or show it next
 * to a patient name, and URLs carry the internal id. Six sequence digits: a busy ASC does tens of thousands of
 * cases a year per site, which four digits would overflow.
 */
export function formatCaseNumber({ facilityCode, year, sequence }: CaseNumberParts): string {
  if (!/^[A-Z0-9]{2,8}$/.test(facilityCode)) throw new Error("invalid facility code");
  if (!Number.isInteger(year) || year < 2000 || year > 2099) throw new Error("invalid case year");
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999_999) throw new Error("invalid case sequence");
  return `${facilityCode}-${year}-${String(sequence).padStart(6, "0")}`;
}
