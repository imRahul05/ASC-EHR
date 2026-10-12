import type { Coverage, CoverageClass, Organization, Patient, Reference } from "@medplum/fhirtypes";
import { facilityMeta, reference, text } from "@asc/fhir/builders/common";

export interface CoverageInput {
  readonly facilityId: string;
  readonly patientId?: string;
  readonly patientRef?: Reference<Patient>;
  readonly payorId: string;
  readonly subscriberId: string;
  readonly status?: "active" | "cancelled" | "draft" | "entered-in-error";
  readonly planName?: string;
  readonly groupNumber?: string;
  readonly relationship?: "self" | "spouse" | "child" | "other";
}

/**
 * A Coverage resource for a patient at a facility.
 * Errors name the field and never echo the value.
 */
export function buildCoverage(input: CoverageInput): Coverage {
  const beneficiary: Reference<Patient> =
    input.patientRef ??
    (input.patientId !== undefined && input.patientId.startsWith("urn:uuid:")
      ? { reference: input.patientId }
      : reference<Patient>("Patient", input.patientId ?? "", "patient id"));
  const payor = [reference<Organization>("Organization", input.payorId, "payor id")];
  const subscriberId = text(input.subscriberId, "subscriber id");

  const classes: CoverageClass[] = [];
  if (input.groupNumber !== undefined) {
    classes.push({
      type: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/coverage-class",
            code: "group",
          },
        ],
      },
      value: text(input.groupNumber, "group number"),
      ...(input.planName === undefined ? {} : { name: text(input.planName, "plan name") }),
    });
  } else if (input.planName !== undefined) {
    classes.push({
      type: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/coverage-class",
            code: "plan",
          },
        ],
      },
      value: text(input.planName, "plan name"),
      name: text(input.planName, "plan name"),
    });
  }

  return {
    resourceType: "Coverage",
    meta: facilityMeta(input.facilityId),
    status: input.status ?? "active",
    subscriberId,
    beneficiary,
    payor,
    ...(input.relationship === undefined
      ? {}
      : {
          relationship: {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/subscriber-relationship",
                code: input.relationship,
              },
            ],
            text: input.relationship,
          },
        }),
    ...(classes.length === 0 ? {} : { class: classes }),
  };
}
