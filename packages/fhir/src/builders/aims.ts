/**
 * FHIR R4 Builders & Parsers for AIMS Anesthesia Information Management System.
 *
 * Regulatory & Clinical Citations:
 * - CMS 42 CFR § 416.42(a) Condition for Coverage: Surgical and Anesthesia Services:
 *   Mandatory pre-anesthesia evaluation conducted immediately prior to surgery by a qualified practitioner.
 * - ASA Standards for Basic Anesthetic Monitoring (Amended October 2020):
 *   Basic anesthetic monitoring requires continuous evaluation of oxygenation (pulse oximetry),
 *   ventilation (continuous EtCO2 capnography from sedation start to end), and circulation (arterial blood pressure
 *   and heart rate at least every 5 minutes).
 * - DEA 21 CFR § 1304.22(c) & § 1304.11: Controlled substance administration and dual-witness disposal of
 *   wasted narcotics (fentanyl, midazolam).
 */

import type { Extension, MedicationAdministration, Observation, ObservationComponent } from "@medplum/fhirtypes";
import type {
  AirwayEvent,
  AirwayEventType,
  AnesthesiaDrug,
  ControlledSubstanceWaste,
  DoseUnit,
  DrugDose,
  PreAnesthesiaAssessment,
  VitalsEntry,
} from "@asc/types";
import { facilityMeta, fhirId, instant, narrativeText, reference } from "@asc/fhir/builders/common";
import { aimsClientIdIdentifier } from "@asc/fhir/identifiers";
import { ANESTHESIA_DRUG_RXNORM, type FhirUrls, fhirUrls, LOINC_CODES } from "@asc/fhir/urls";

const RXNORM_SYSTEM = "http://www.nlm.nih.gov/research/umls/rxnorm";
const UCUM_SYSTEM = "http://unitsofmeasure.org";
const LOINC_SYSTEM = "http://loinc.org";

/**
 * Builds a FHIR R4 MedicationAdministration resource for an administered anesthesia drug dose.
 * Embeds dual-witness controlled substance waste per DEA 21 CFR § 1304.22(c).
 */
export function buildMedicationAdministration(
  dose: DrugDose,
  caseId: string,
  facilityId: string,
  clientId?: string,
  patientId?: string,
  urls: FhirUrls = fhirUrls,
): MedicationAdministration {
  const facility = fhirId(facilityId, "facility id");
  const encId = fhirId(caseId, "case id");
  const patId = fhirId(patientId ?? caseId, "patient id");
  const effectiveAt = instant(dose.at, "dose.at");

  const rxnormCode = ANESTHESIA_DRUG_RXNORM[dose.drug];
  const ucumCode = dose.unit === "mcg" ? "ug" : dose.unit;

  const extensions: Extension[] = [];

  if (dose.waste) {
    const wasteExt: Extension[] = [
      { url: "drug", valueString: dose.waste.drug },
      { url: "administeredAmount", valueDecimal: dose.waste.administeredAmount },
      { url: "wastedAmount", valueDecimal: dose.waste.wastedAmount },
      { url: "unit", valueString: dose.waste.unit },
      { url: "witnessedBy", valueReference: reference("Practitioner", dose.waste.witnessedBy.id) },
      { url: "witnessedByName", valueString: dose.waste.witnessedBy.name },
      { url: "witnessedByInitials", valueString: dose.waste.witnessedBy.initials },
      { url: "witnessedAt", valueDateTime: instant(dose.waste.witnessedAt, "witnessedAt") },
    ];
    if (dose.waste.reason) {
      wasteExt.push({ url: "reason", valueString: narrativeText(dose.waste.reason, "waste reason") });
    }
    extensions.push({
      url: urls.structureDefinition("controlled-substance-waste"),
      extension: wasteExt,
    });
  }

  return {
    resourceType: "MedicationAdministration",
    id: fhirId(dose.id, "dose.id"),
    meta: facilityMeta(facility),
    status: "completed",
    medicationCodeableConcept: {
      coding: [
        {
          system: RXNORM_SYSTEM,
          code: rxnormCode,
          display: dose.drug,
        },
      ],
      text: dose.drug,
    },
    subject: reference("Patient", patId),
    context: reference("Encounter", encId),
    effectiveDateTime: effectiveAt,
    performer: [
      {
        actor: reference("Practitioner", dose.by.id),
        function: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/med-admin-perform-function",
              code: "performer",
              display: "Performer",
            },
          ],
          text: dose.by.name,
        },
      },
    ],
    dosage: {
      route: {
        coding: [
          {
            system: "http://snomed.info/sct",
            code: "47625008",
            display: "Intravenous route",
          },
        ],
        text: "IV",
      },
      dose: {
        value: dose.amount,
        unit: dose.unit,
        system: UCUM_SYSTEM,
        code: ucumCode,
      },
    },
    identifier: clientId ? [aimsClientIdIdentifier(clientId, urls)] : undefined,
    extension: extensions.length > 0 ? extensions : undefined,
  };
}

/**
 * Parses a MedicationAdministration resource back into a typed DrugDose record.
 */
export function parseMedicationAdministration(
  resource: MedicationAdministration,
  urls: FhirUrls = fhirUrls,
): DrugDose {
  const drugName = resource.medicationCodeableConcept?.text as AnesthesiaDrug | undefined;
  const coding = resource.medicationCodeableConcept?.coding?.[0];
  const doseValue = resource.dosage?.dose?.value ?? 0;
  const unitCode = resource.dosage?.dose?.unit as DoseUnit | undefined;

  let drug: AnesthesiaDrug = "propofol";
  if (drugName) {
    drug = drugName;
  } else if (coding?.code) {
    const matched = (Object.entries(ANESTHESIA_DRUG_RXNORM) as [AnesthesiaDrug, string][]).find(
      ([, rxCode]) => rxCode === coding.code,
    );
    if (matched) {
      drug = matched[0];
    }
  }

  const performerActor = resource.performer?.[0]?.actor;
  const performerName = resource.performer?.[0]?.function?.text ?? "Anesthesia Provider";
  const performerId = performerActor?.reference?.replace("Practitioner/", "") ?? "unknown-performer";

  let waste: ControlledSubstanceWaste | undefined;
  const wasteUrl = urls.structureDefinition("controlled-substance-waste");
  const wasteExt = resource.extension?.find((e) => e.url === wasteUrl)?.extension;

  if (wasteExt) {
    const wDrug = (wasteExt.find((e) => e.url === "drug")?.valueString as AnesthesiaDrug) ?? drug;
    const adminAmt = wasteExt.find((e) => e.url === "administeredAmount")?.valueDecimal ?? doseValue;
    const wastedAmt = wasteExt.find((e) => e.url === "wastedAmount")?.valueDecimal ?? 0;
    const wUnit = (wasteExt.find((e) => e.url === "unit")?.valueString as DoseUnit) ?? unitCode ?? "mg";
    const witnessRef = wasteExt.find((e) => e.url === "witnessedBy")?.valueReference?.reference ?? "";
    const witnessName = wasteExt.find((e) => e.url === "witnessedByName")?.valueString ?? "Witness RN";
    const witnessInitials = wasteExt.find((e) => e.url === "witnessedByInitials")?.valueString ?? "RN";
    const witnessTime = wasteExt.find((e) => e.url === "witnessedAt")?.valueDateTime ?? "";
    const reason = wasteExt.find((e) => e.url === "reason")?.valueString;

    waste = {
      drug: wDrug,
      administeredAmount: adminAmt,
      wastedAmount: wastedAmt,
      unit: wUnit,
      witnessedBy: {
        id: witnessRef.replace("Practitioner/", ""),
        name: witnessName,
        initials: witnessInitials,
      },
      witnessedAt: witnessTime,
      reason,
    };
  }

  return {
    id: resource.id ?? "dose-temp",
    drug,
    amount: doseValue,
    unit: unitCode ?? "mg",
    route: "IV",
    at: resource.effectiveDateTime ?? new Date().toISOString(),
    by: {
      id: performerId,
      name: performerName,
      initials: performerName
        .split(" ")
        .map((p) => p[0])
        .join("")
        .toUpperCase()
        .slice(0, 3),
    },
    waste,
  };
}

interface IntraopVitalConfig {
  readonly key: string;
  readonly code: string;
  readonly display: string;
  readonly value: number | undefined;
  readonly unit: string;
  readonly unitCode: string;
}

/**
 * Builds discrete LOINC-coded FHIR R4 vital signs Observation resources for an intra-op vitals check.
 */
export function buildIntraopVitalsObservations(
  entry: VitalsEntry,
  caseId: string,
  facilityId: string,
  clientId?: string,
  patientId?: string,
  urls: FhirUrls = fhirUrls,
): readonly Observation[] {
  const facility = fhirId(facilityId, "facility id");
  const encId = fhirId(caseId, "case id");
  const patId = fhirId(patientId ?? caseId, "patient id");
  const now = instant(entry.recordedAt, "recordedAt");

  const configs: readonly IntraopVitalConfig[] = [
    { key: "sbp", code: "8480-6", display: "Systolic blood pressure", value: entry.sbp, unit: "mmHg", unitCode: "mm[Hg]" },
    { key: "dbp", code: "8462-4", display: "Diastolic blood pressure", value: entry.dbp, unit: "mmHg", unitCode: "mm[Hg]" },
    { key: "hr", code: "8867-4", display: "Heart rate", value: entry.hr, unit: "beats/minute", unitCode: "/min" },
    { key: "rr", code: "9279-1", display: "Respiratory rate", value: entry.rr, unit: "breaths/minute", unitCode: "/min" },
    { key: "spo2", code: "59408-5", display: "Oxygen saturation in Arterial blood", value: entry.spo2, unit: "%", unitCode: "%" },
    { key: "etco2", code: LOINC_CODES.ETCO2, display: "Carbon dioxide in Exhaled gas", value: entry.etco2, unit: "mmHg", unitCode: "mm[Hg]" },
    { key: "tempC", code: "8310-5", display: "Body temperature", value: entry.tempC, unit: "degC", unitCode: "Cel" },
    { key: "pain", code: "72514-3", display: "Pain severity - 0-10 verbal numeric rating", value: entry.pain, unit: "score", unitCode: "{score}" },
  ];

  return configs
    .filter((cfg) => cfg.value !== undefined)
    .map((cfg) => ({
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
        coding: [{ system: LOINC_SYSTEM, code: cfg.code, display: cfg.display }],
        text: cfg.display,
      },
      subject: reference("Patient", patId),
      encounter: reference("Encounter", encId),
      effectiveDateTime: now,
      performer: [reference("Practitioner", entry.recordedBy.id)],
      valueQuantity: {
        value: cfg.value,
        unit: cfg.unit,
        system: UCUM_SYSTEM,
        code: cfg.unitCode,
      },
      identifier: clientId ? [aimsClientIdIdentifier(clientId, urls)] : undefined,
    }));
}

/**
 * Parses discrete vital Observation resources back into grouped VitalsEntry records.
 */
export function parseVitalsObservations(observations: readonly Observation[]): readonly VitalsEntry[] {
  const groupsByTime = new Map<string, { obs: Observation[]; time: string; performerId: string }>();

  for (const obs of observations) {
    const time = obs.effectiveDateTime ?? new Date().toISOString();
    const performer = obs.performer?.[0]?.reference?.replace("Practitioner/", "") ?? "clinician";
    const key = `${time}:${performer}`;

    const existing = groupsByTime.get(key);
    if (!existing) {
      groupsByTime.set(key, { obs: [obs], time, performerId: performer });
    } else {
      existing.obs.push(obs);
    }
  }

  const entries: VitalsEntry[] = [];

  for (const [key, group] of groupsByTime.entries()) {
    let sbp: number | undefined;
    let dbp: number | undefined;
    let hr: number | undefined;
    let rr: number | undefined;
    let spo2: number | undefined;
    let etco2: number | undefined;
    let tempC: number | undefined;
    let pain: number | undefined;

    for (const obs of group.obs) {
      const code = obs.code.coding?.[0]?.code;
      const val = obs.valueQuantity?.value;
      if (val === undefined) continue;

      switch (code) {
        case "8480-6":
          sbp = val;
          break;
        case "8462-4":
          dbp = val;
          break;
        case "8867-4":
          hr = val;
          break;
        case "9279-1":
          rr = val;
          break;
        case "59408-5":
          spo2 = val;
          break;
        case LOINC_CODES.ETCO2:
          etco2 = val;
          break;
        case "8310-5":
          tempC = val;
          break;
        case "72514-3":
          pain = val;
          break;
      }
    }

    // Never fabricate cardiovascular vitals. Require at least one measured vital sign.
    if (sbp === undefined && dbp === undefined && hr === undefined && spo2 === undefined && rr === undefined) {
      continue;
    }

    entries.push({
      id: `vitals-${key}`,
      caseId: group.obs[0]?.encounter?.reference?.replace("Encounter/", "") ?? "case",
      context: "intra",
      recordedAt: group.time,
      hr: hr ?? 0,
      sbp: sbp ?? 0,
      dbp: dbp ?? 0,
      spo2: spo2 ?? 0,
      rr: rr ?? 0,
      etco2,
      tempC,
      pain,
      recordedBy: {
        id: group.performerId,
        name: "Staff Provider",
        initials: "SP",
      },
    });
  }

  return entries.sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
}

/**
 * Builds discrete Observation for Pre-Anesthesia Medical Assessment (CMS 42 CFR § 416.42(a)).
 */
export function buildPreAnesthesiaObservation(
  assessment: PreAnesthesiaAssessment,
  caseId: string,
  facilityId: string,
  patientId?: string,
  urls: FhirUrls = fhirUrls,
): Observation {
  const facility = fhirId(facilityId, "facility id");
  const encId = fhirId(caseId, "case id");
  const patId = fhirId(patientId ?? caseId, "patient id");
  const now = instant(assessment.assessedAt, "assessedAt");

  const components: ObservationComponent[] = [
    {
      code: {
        coding: [{ system: LOINC_SYSTEM, code: LOINC_CODES.ASA_PHYSICAL_STATUS, display: "ASA physical status classification" }],
        text: "ASA physical status",
      },
      valueInteger: assessment.asaClass,
    },
    {
      code: {
        coding: [{ system: LOINC_SYSTEM, code: LOINC_CODES.MALLAMPATI_SCORE, display: "Mallampati score" }],
        text: "Mallampati score",
      },
      valueInteger: assessment.mallampati,
    },
    {
      code: {
        coding: [{ system: urls.codeSystem("pre-anesthesia-component"), code: "npo-satisfied", display: "NPO fasting satisfied" }],
        text: "NPO status satisfied",
      },
      valueBoolean: assessment.npoStatusSatisfied,
    },
    {
      code: {
        coding: [{ system: urls.codeSystem("pre-anesthesia-component"), code: "last-oral-intake", display: "Last oral intake timestamp" }],
        text: "Last oral intake",
      },
      valueDateTime: instant(assessment.lastOralIntakeIso, "lastOralIntakeIso"),
    },
  ];

  if (assessment.airwayNotes) {
    components.push({
      code: {
        coding: [{ system: urls.codeSystem("pre-anesthesia-component"), code: "airway-notes", display: "Airway assessment notes" }],
        text: "Airway notes",
      },
      valueString: narrativeText(assessment.airwayNotes, "airwayNotes"),
    });
  }

  return {
    resourceType: "Observation",
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
      coding: [{ system: LOINC_SYSTEM, code: LOINC_CODES.ASA_PHYSICAL_STATUS, display: "Pre-anesthesia evaluation" }],
      text: "Pre-anesthesia evaluation",
    },
    subject: reference("Patient", patId),
    encounter: reference("Encounter", encId),
    effectiveDateTime: now,
    performer: [
      reference("Practitioner", assessment.assessedBy.id),
    ],
    component: components,
  };
}

/**
 * Parses a Pre-Anesthesia Observation back into a PreAnesthesiaAssessment.
 */
export function parsePreAnesthesiaObservation(
  resource: Observation,
  urls: FhirUrls = fhirUrls,
): PreAnesthesiaAssessment {
  let asaClass: 1 | 2 | 3 | 4 | 5 = 2;
  let mallampati: 1 | 2 | 3 | 4 = 1;
  let npoStatusSatisfied = false;
  let lastOralIntakeIso = resource.effectiveDateTime ?? new Date().toISOString();
  let airwayNotes: string | undefined;

  for (const comp of resource.component ?? []) {
    const code = comp.code.coding?.[0]?.code;
    const system = comp.code.coding?.[0]?.system;

    if (code === LOINC_CODES.ASA_PHYSICAL_STATUS && comp.valueInteger) {
      if (comp.valueInteger >= 1 && comp.valueInteger <= 5) {
        asaClass = comp.valueInteger as 1 | 2 | 3 | 4 | 5;
      }
    } else if (code === LOINC_CODES.MALLAMPATI_SCORE && comp.valueInteger) {
      if (comp.valueInteger >= 1 && comp.valueInteger <= 4) {
        mallampati = comp.valueInteger as 1 | 2 | 3 | 4;
      }
    } else if (system === urls.codeSystem("pre-anesthesia-component")) {
      if (code === "npo-satisfied" && comp.valueBoolean !== undefined) {
        npoStatusSatisfied = comp.valueBoolean;
      } else if (code === "last-oral-intake" && comp.valueDateTime) {
        lastOralIntakeIso = comp.valueDateTime;
      } else if (code === "airway-notes" && comp.valueString) {
        airwayNotes = comp.valueString;
      }
    }
  }

  const performerRef = resource.performer?.[0]?.reference?.replace("Practitioner/", "") ?? "anesthesiologist";

  return {
    asaClass,
    mallampati,
    airwayNotes,
    lastOralIntakeIso,
    npoStatusSatisfied,
    assessedAt: resource.effectiveDateTime ?? new Date().toISOString(),
    assessedBy: {
      id: performerRef,
      name: "Assessing Anesthesiologist",
      initials: "AA",
    },
  };
}

export interface BuildAirwayEventObservationOptions {
  readonly clientId?: string;
  readonly patientId?: string;
}

/**
 * Builds discrete Observation for Airway Events.
 */
export function buildAirwayEventObservation(
  event: AirwayEvent,
  caseId: string,
  facilityId: string,
  patientIdOrOptions?: string | BuildAirwayEventObservationOptions,
  urls: FhirUrls = fhirUrls,
): Observation {
  const patientId =
    typeof patientIdOrOptions === "object"
      ? patientIdOrOptions.patientId
      : patientIdOrOptions;
  const clientId =
    typeof patientIdOrOptions === "object" ? patientIdOrOptions.clientId : undefined;

  const facility = fhirId(facilityId, "facility id");
  const encId = fhirId(caseId, "case id");
  const patId = fhirId(patientId ?? caseId, "patient id");
  const now = instant(event.at, "event.at");

  return {
    resourceType: "Observation",
    id: fhirId(event.id, "event.id"),
    meta: facilityMeta(facility),
    status: "final",
    identifier: clientId ? [aimsClientIdIdentifier(clientId, urls)] : undefined,
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
            code: "procedure",
            display: "Procedure",
          },
        ],
      },
    ],
    code: {
      coding: [{ system: LOINC_SYSTEM, code: LOINC_CODES.AIRWAY_EVENT, display: "Procedure event" }],
      text: "Airway event",
    },
    subject: reference("Patient", patId),
    encounter: reference("Encounter", encId),
    effectiveDateTime: now,
    valueCodeableConcept: {
      coding: [
        {
          system: urls.codeSystem("airway-event-type"),
          code: event.type,
          display: event.type,
        },
      ],
      text: event.type,
    },
    note: event.note ? [{ text: narrativeText(event.note, "airway event note") }] : undefined,
  };
}

/**
 * Parses an Airway Event Observation back into an AirwayEvent.
 */
export function parseAirwayEventObservation(resource: Observation): AirwayEvent {
  const typeCode = (resource.valueCodeableConcept?.coding?.[0]?.code ?? "jaw_thrust") as AirwayEventType;
  const note = resource.note?.[0]?.text;

  return {
    id: resource.id ?? "airway-event-temp",
    type: typeCode,
    at: resource.effectiveDateTime ?? new Date().toISOString(),
    note,
  };
}
