import type { Coding, Encounter, Patient, Practitioner, ServiceRequest } from "@medplum/fhirtypes";
import type { ProcedureIntent } from "@asc/types";
import { facilityMeta, instant, reference, text } from "@asc/fhir/builders/common";
import { isProcedureIntent } from "@asc/fhir/case-phase";
import { procedureIntentExtension } from "@asc/fhir/extensions";
import { type FhirUrls, fhirUrls } from "@asc/fhir/urls";

export const CPT_CODE_SYSTEM = "http://www.ama-assn.org/go/cpt";

export interface ServiceRequestInput {
  readonly facilityId: string;
  readonly patientId: string;
  readonly procedureIntent: ProcedureIntent;
  readonly primaryProcedureCode: string;
  readonly secondaryProcedureCodes?: readonly string[];
  readonly encounterId?: string;
  readonly requesterId?: string;
  readonly notes?: string;
  readonly authoredOn?: string;
}

/**
 * Builds a FHIR ServiceRequest representing an order for a surgical/endoscopic procedure,
 * capturing the clinical intent (screening, surveillance, diagnostic, therapeutic) and procedure codes.
 */
export function buildServiceRequest(input: ServiceRequestInput, urls: FhirUrls = fhirUrls): ServiceRequest {
  if (!isProcedureIntent(input.procedureIntent)) throw new Error("invalid procedure intent");

  const primaryCode = text(input.primaryProcedureCode, "primary procedure code", 32);
  const secondaryCodes = (input.secondaryProcedureCodes ?? []).map((code) =>
    text(code, "secondary procedure code", 32),
  );
  const authoredOn = input.authoredOn === undefined ? undefined : instant(input.authoredOn, "authored on");

  const codings: Coding[] = [
    { system: CPT_CODE_SYSTEM, code: primaryCode },
    ...secondaryCodes.map((code) => ({ system: CPT_CODE_SYSTEM, code })),
  ];

  return {
    resourceType: "ServiceRequest",
    meta: facilityMeta(input.facilityId),
    status: "active",
    intent: "order",
    extension: [procedureIntentExtension(input.procedureIntent, urls)],
    code: {
      coding: codings,
      text: primaryCode,
    },
    subject: reference<Patient>("Patient", input.patientId, "patient id"),
    ...(input.encounterId === undefined
      ? {}
      : { encounter: reference<Encounter>("Encounter", input.encounterId, "encounter id") }),
    ...(input.requesterId === undefined
      ? {}
      : { requester: reference<Practitioner>("Practitioner", input.requesterId, "requester id") }),
    ...(authoredOn === undefined ? {} : { authoredOn }),
    ...(input.notes === undefined
      ? {}
      : { note: [{ text: text(input.notes, "service request notes", 500) }] }),
  };
}
