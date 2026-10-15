import type { Bundle, Observation } from "@medplum/fhirtypes";
import { createTransaction } from "@asc/fhir/bundle";
import { facilityMeta, fhirId, instant, reference } from "@asc/fhir/builders/common";

export interface PreopObservationsInput {
  readonly facilityId: string;
  readonly patientId: string;
  readonly caseId: string;
  readonly recordedAt?: string;
  readonly performerId?: string;
  readonly vitals: {
    readonly sbp: number;
    readonly dbp: number;
    readonly hr: number;
    readonly rr: number;
    readonly spo2: number;
    readonly tempC: number;
    readonly heightInches?: number;
    readonly weightLbs?: number;
  };
}

interface VitalConfig {
  readonly key: string;
  readonly code: string;
  readonly display: string;
  readonly value: number | undefined;
  readonly unit: string;
  readonly unitCode: string;
}

/**
 * Builds discrete LOINC-coded FHIR R4 vital signs Observation resources.
 */
export function buildPreopObservations(input: PreopObservationsInput): readonly Observation[] {
  const facility = fhirId(input.facilityId, "facility id");
  const patient = fhirId(input.patientId, "patient id");
  const encounter = fhirId(input.caseId, "case id");
  const now = input.recordedAt !== undefined ? instant(input.recordedAt, "recordedAt") : new Date().toISOString();

  const configs: readonly VitalConfig[] = [
    {
      key: "sbp",
      code: "8480-6",
      display: "Systolic blood pressure",
      value: input.vitals.sbp,
      unit: "mmHg",
      unitCode: "mm[Hg]",
    },
    {
      key: "dbp",
      code: "8462-4",
      display: "Diastolic blood pressure",
      value: input.vitals.dbp,
      unit: "mmHg",
      unitCode: "mm[Hg]",
    },
    {
      key: "hr",
      code: "8867-4",
      display: "Heart rate",
      value: input.vitals.hr,
      unit: "/min",
      unitCode: "/min",
    },
    {
      key: "rr",
      code: "9279-1",
      display: "Respiratory rate",
      value: input.vitals.rr,
      unit: "/min",
      unitCode: "/min",
    },
    {
      key: "spo2",
      code: "2708-6",
      display: "Oxygen saturation in Arterial blood",
      value: input.vitals.spo2,
      unit: "%",
      unitCode: "%",
    },
    {
      key: "temp",
      code: "8310-5",
      display: "Body temperature",
      value: input.vitals.tempC,
      unit: "Cel",
      unitCode: "Cel",
    },
    {
      key: "height",
      code: "8302-2",
      display: "Body height",
      value: input.vitals.heightInches,
      unit: "in",
      unitCode: "[in_i]",
    },
    {
      key: "weight",
      code: "29463-7",
      display: "Body weight",
      value: input.vitals.weightLbs,
      unit: "lbs",
      unitCode: "[lb_av]",
    },
  ];

  const observations: Observation[] = [];

  for (const item of configs) {
    if (item.value === undefined) continue;

    const obs: Observation = {
      resourceType: "Observation",
      meta: facilityMeta(facility),
      status: "final",
      category: [
        {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/observation-category",
              code: "vital-signs",
              display: "Vital Signs",
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: "http://loinc.org",
            code: item.code,
            display: item.display,
          },
        ],
        text: item.display,
      },
      subject: reference("Patient", patient),
      encounter: reference("Encounter", encounter),
      effectiveDateTime: now,
      valueQuantity: {
        value: item.value,
        unit: item.unit,
        system: "http://unitsofmeasure.org",
        code: item.unitCode,
      },
    };

    if (input.performerId !== undefined) {
      obs.performer = [reference("Practitioner", input.performerId)];
    }

    observations.push(obs);
  }

  return observations;
}

/**
 * Builds a FHIR transaction bundle containing discrete pre-op vital signs observations.
 */
export function buildPreopObservationsBundle(input: PreopObservationsInput): Bundle {
  const observations = buildPreopObservations(input);
  const tx = createTransaction({ facilityId: input.facilityId });

  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i]!;
    tx.add(`obs-${i}`, obs);
  }

  return tx.build();
}
