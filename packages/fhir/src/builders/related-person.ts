import type { ContactPoint, HumanName, Patient, RelatedPerson } from "@medplum/fhirtypes";
import { facilityMeta, reference, text } from "@asc/fhir/builders/common";

export interface RelatedPersonInput {
  readonly facilityId: string;
  readonly patientId: string;
  readonly relationship: string;
  readonly name?: { readonly family: string; readonly given?: readonly string[] } | string;
  readonly telecom?: readonly { readonly system: "phone" | "email"; readonly value: string }[];
  readonly active?: boolean;
}

/**
 * A RelatedPerson resource for an escort, guarantor, or emergency contact.
 * Errors name the field and never echo the value.
 */
export function buildRelatedPerson(input: RelatedPersonInput): RelatedPerson {
  const patient = reference<Patient>("Patient", input.patientId, "patient id");
  const relationshipText = text(input.relationship, "relationship");

  let name: HumanName[] | undefined;
  if (typeof input.name === "string") {
    name = [{ text: text(input.name, "related person name") }];
  } else if (input.name !== undefined) {
    name = [
      {
        family: text(input.name.family, "related person family name"),
        ...(input.name.given === undefined || input.name.given.length === 0
          ? {}
          : { given: input.name.given.map((g) => text(g, "related person given name")) }),
      },
    ];
  }

  const telecom: ContactPoint[] | undefined =
    input.telecom === undefined || input.telecom.length === 0
      ? undefined
      : input.telecom.map((t) => ({
          system: t.system,
          value: text(t.value, "telecom value"),
        }));

  return {
    resourceType: "RelatedPerson",
    meta: facilityMeta(input.facilityId),
    active: input.active ?? true,
    patient,
    relationship: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v3-RoleCode",
            code: relationshipText,
          },
        ],
        text: relationshipText,
      },
    ],
    ...(name === undefined ? {} : { name }),
    ...(telecom === undefined ? {} : { telecom }),
  };
}
