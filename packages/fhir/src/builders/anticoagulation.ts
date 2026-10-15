import type { Observation, ObservationComponent } from "@medplum/fhirtypes";
import { facilityMeta, fhirId, instant, reference } from "@asc/fhir/builders/common";
import { type FhirUrls, fhirUrls } from "@asc/fhir/urls";

export interface AnticoagulationRecommendationData {
  readonly medicationId: string;
  readonly medicationName: string;
  readonly drugClass: string;
  readonly recommendedHoldHours: number;
  readonly recommendationText: string;
  readonly prescriberInstructionDate?: string | null;
  readonly prescriberInstruction?: string | null;
  readonly patientConfirmedHeld?: boolean | null;
}

export interface BuildAnticoagulationObservationInput {
  readonly facilityId: string;
  readonly caseId: string;
  readonly patientId: string;
  readonly procedureBleedingRisk: "low" | "high";
  readonly hasAnticoagulants: boolean;
  readonly status: "satisfied" | "pending" | "failed";
  readonly recommendations?: readonly AnticoagulationRecommendationData[];
  readonly assessedAt?: string;
  readonly practitionerId?: string;
  readonly id?: string;
}

/**
 * Builds a FHIR R4 Observation representing the ASGE peri-procedural
 * anticoagulation & antiplatelet medication hold evaluation.
 */
export function buildAnticoagulationObservation(
  input: BuildAnticoagulationObservationInput,
  urls: FhirUrls = fhirUrls,
): Observation {
  const facility = fhirId(input.facilityId, "facility id");
  const encounterId = fhirId(input.caseId, "case id");
  const patient = fhirId(input.patientId, "patient id");

  const effectiveDate = input.assessedAt !== undefined ? instant(input.assessedAt, "assessedAt") : new Date().toISOString();

  const components: ObservationComponent[] = [
    {
      code: {
        coding: [
          {
            system: urls.codeSystem("clinical-assessment"),
            code: "bleeding-risk",
            display: "Procedure Bleeding Risk",
          },
        ],
        text: "Procedure Bleeding Risk",
      },
      valueString: input.procedureBleedingRisk,
    },
    {
      code: {
        coding: [
          {
            system: urls.codeSystem("clinical-assessment"),
            code: "has-anticoagulants",
            display: "Has Anticoagulants or Antiplatelets",
          },
        ],
        text: "Has Anticoagulants or Antiplatelets",
      },
      valueBoolean: input.hasAnticoagulants,
    },
  ];

  if (input.recommendations && input.recommendations.length > 0) {
    for (const rec of input.recommendations) {
      components.push({
        code: {
          coding: [
            {
              system: urls.codeSystem("clinical-assessment"),
              code: `med-hold-${rec.medicationId}`,
              display: rec.medicationName,
            },
          ],
          text: rec.medicationName,
        },
        valueString: [
          `Drug Class: ${rec.drugClass}`,
          `Recommendation: ${rec.recommendationText}`,
          `Recommended Hold: ${rec.recommendedHoldHours}h`,
          rec.prescriberInstructionDate ? `Prescriber Instruction Date: ${rec.prescriberInstructionDate}` : "Prescriber Instruction: Missing",
          rec.patientConfirmedHeld === true
            ? "Patient Day-of Hold: Confirmed Held"
            : rec.patientConfirmedHeld === false
              ? "Patient Day-of Hold: NOT HELD"
              : "Patient Day-of Hold: Unconfirmed",
        ].join(" | "),
      });
    }
  }

  const observation: Observation = {
    resourceType: "Observation",
    ...(input.id ? { id: fhirId(input.id, "observation id") } : {}),
    meta: facilityMeta(facility),
    status: "final",
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
            code: "exam",
            display: "Exam",
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: "http://loinc.org",
          code: "80585-3",
          display: "Medication hold status",
        },
      ],
      text: "ASGE Anticoagulation & Antiplatelet Hold Assessment",
    },
    subject: reference("Patient", patient),
    encounter: reference("Encounter", encounterId),
    effectiveDateTime: effectiveDate,
    ...(input.practitionerId ? { performer: [reference("Practitioner", input.practitionerId)] } : {}),
    valueString: input.status,
    component: components,
  };

  return observation;
}
