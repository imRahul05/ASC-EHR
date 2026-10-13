import type { Address, ContactPoint, Identifier, Patient } from "@medplum/fhirtypes";
import { facilityMeta, isoDate, text } from "@asc/fhir/builders/common";
import { ecwPatientIdentifier, mrnIdentifier } from "@asc/fhir/identifiers";
import { type FhirUrls, fhirUrls } from "@asc/fhir/urls";

export interface PatientTelecomInput {
  readonly system: "phone" | "email";
  readonly value: string;
}

export interface PatientAddressInput {
  readonly line?: readonly string[];
  readonly city?: string;
  readonly state?: string;
  readonly postalCode?: string;
  readonly country?: string;
}

export interface PatientInput {
  readonly facilityId: string;
  readonly name: { readonly family: string; readonly given: readonly string[] };
  /** `YYYY-MM-DD`. */
  readonly birthDate?: string;
  readonly gender?: "male" | "female" | "other" | "unknown";
  readonly mrn?: string;
  /** The patient's id in eCW, so ASC EHR and MindScript resolve the same person (06 §5.1). */
  readonly ecw?: { readonly practice: string; readonly patientId: string };
  readonly telecom?: readonly PatientTelecomInput[];
  readonly address?: readonly PatientAddressInput[];
}

/** A Patient of one facility. The input is PHI: nothing here logs it and errors do not repeat it. */
export function buildPatient(input: PatientInput, urls: FhirUrls = fhirUrls): Patient {
  if (input.name.given.length === 0) throw new Error("invalid patient given name");
  const identifier: Identifier[] = [
    ...(input.mrn === undefined ? [] : [mrnIdentifier(input.mrn, urls)]),
    ...(input.ecw === undefined ? [] : [ecwPatientIdentifier(input.ecw.practice, input.ecw.patientId)]),
  ];

  const telecom: ContactPoint[] | undefined =
    input.telecom === undefined || input.telecom.length === 0
      ? undefined
      : input.telecom.map((t) => ({
          system: t.system,
          value: text(t.value, "telecom value"),
        }));

  const address: Address[] | undefined =
    input.address === undefined || input.address.length === 0
      ? undefined
      : input.address.map((a) => ({
          ...(a.line === undefined || a.line.length === 0
            ? {}
            : { line: a.line.map((l) => text(l, "address line")) }),
          ...(a.city === undefined ? {} : { city: text(a.city, "address city") }),
          ...(a.state === undefined ? {} : { state: text(a.state, "address state") }),
          ...(a.postalCode === undefined ? {} : { postalCode: text(a.postalCode, "address postal code") }),
          ...(a.country === undefined ? {} : { country: text(a.country, "address country") }),
        }));

  return {
    resourceType: "Patient",
    meta: facilityMeta(input.facilityId),
    ...(identifier.length === 0 ? {} : { identifier }),
    name: [{ family: text(input.name.family, "patient family name"), given: input.name.given.map((given) => text(given, "patient given name")) }],
    ...(input.birthDate === undefined ? {} : { birthDate: isoDate(input.birthDate, "patient birth date") }),
    ...(input.gender === undefined ? {} : { gender: input.gender }),
    ...(telecom === undefined ? {} : { telecom }),
    ...(address === undefined ? {} : { address }),
  };
}
