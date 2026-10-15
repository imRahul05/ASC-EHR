import type { DocumentReference } from "@medplum/fhirtypes";
import { facilityMeta, fhirId, instant, narrativeText, reference, text } from "@asc/fhir/builders/common";

export interface BuildHpUpdateDocumentReferenceInput {
  readonly facilityId: string;
  readonly caseId: string;
  readonly patientId: string;
  readonly practitionerId?: string;
  readonly practitionerName?: string;
  readonly attestation: string;
  readonly cardiovascularStatus: string;
  readonly pulmonaryStatus: string;
  readonly airwayStatus?: string;
  readonly signedAt?: string;
  readonly id?: string;
}

export function toBase64(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1: string) =>
      String.fromCharCode(parseInt(p1, 16)),
    ),
  );
}

/**
 * Builds a FHIR R4 DocumentReference representing the CMS 42 CFR § 416.52
 * day-of pre-procedure H&P interval update note.
 */
export function buildHpUpdateDocumentReference(
  input: BuildHpUpdateDocumentReferenceInput,
): DocumentReference {
  const facility = fhirId(input.facilityId, "facility id");
  const encounterId = fhirId(input.caseId, "case id");
  const patient = fhirId(input.patientId, "patient id");

  const signedDate = input.signedAt !== undefined ? instant(input.signedAt, "signedAt") : new Date().toISOString();

  const noteBody = [
    `Day-of Pre-Procedure H&P Interval Update Note`,
    `Signed: ${signedDate}`,
    input.practitionerName ? `Physician: ${input.practitionerName}` : null,
    `Attestation: ${input.attestation}`,
    `Cardiovascular Status: ${input.cardiovascularStatus}`,
    `Pulmonary Status: ${input.pulmonaryStatus}`,
    input.airwayStatus ? `Airway Status: ${input.airwayStatus}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const docRef: DocumentReference = {
    resourceType: "DocumentReference",
    ...(input.id ? { id: fhirId(input.id, "document id") } : {}),
    meta: facilityMeta(facility),
    status: "current",
    docStatus: "final",
    type: {
      coding: [
        {
          system: "http://loinc.org",
          code: "11506-3",
          display: "Progress note",
        },
      ],
      text: "Pre-procedure H&P Day-of Interval Update Note",
    },
    category: [
      {
        coding: [
          {
            system: "http://loinc.org",
            code: "LP173418-7",
            display: "Note",
          },
        ],
      },
    ],
    subject: reference("Patient", patient),
    date: signedDate,
    ...(input.practitionerId ? { author: [reference("Practitioner", input.practitionerId)] } : {}),
    description: narrativeText(text(input.attestation, "attestation", 200), "description"),
    content: [
      {
        attachment: {
          contentType: "text/plain",
          data: toBase64(noteBody),
          title: "Day-of H&P Interval Update Note",
        },
      },
    ],
    context: {
      encounter: [reference("Encounter", encounterId)],
    },
  };

  return docRef;
}
