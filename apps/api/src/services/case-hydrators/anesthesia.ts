/**
 * Case Hydrator: AIMS Anesthesia Flowsheet & Records.
 *
 * US Healthcare Regulations & Clinical Standards:
 * - CMS 42 CFR § 416.42(a) Condition for Coverage: Surgical and Anesthesia Services:
 *   Mandatory pre-anesthesia evaluation conducted immediately prior to surgery by a qualified practitioner.
 * - ASA Standards for Basic Anesthetic Monitoring (Amended October 2020):
 *   Basic anesthetic monitoring requires continuous evaluation of oxygenation (pulse oximetry),
 *   ventilation (continuous EtCO2 capnography from sedation start to end), and circulation (arterial blood pressure
 *   and heart rate at least every 5 minutes).
 * - DEA 21 CFR § 1304.22(c) & § 1304.11: Controlled substance administration and dual-witness disposal of
 *   wasted narcotics.
 */

import type {
  AirwayEvent,
  AnesthesiaRecord,
  DrugDose,
  PreAnesthesiaAssessment,
  ProcedureEvent,
  StaffRef,
} from "@asc/types";
import {
  LOINC_CODES,
  parseAirwayEventObservation,
  parseMedicationAdministration,
  parsePreAnesthesiaObservation,
  parseVitalsObservations,
} from "@asc/fhir";
import type { MedplumClient } from "@medplum/core";
import type { MedicationAdministration, Observation } from "@medplum/fhirtypes";

interface HydrateAnesthesiaRecordInput {
  readonly caseId: string;
  readonly provider?: StaffRef;
  readonly medplum: MedplumClient;
  readonly observations?: readonly Observation[];
  readonly medAdmins?: readonly MedicationAdministration[];
  readonly events?: readonly ProcedureEvent[];
}

const VITAL_SIGN_CODES: ReadonlySet<string> = new Set([
  "8480-6", // SBP
  "8462-4", // DBP
  "8867-4", // HR
  "9279-1", // RR
  "59408-5", // SpO2
  LOINC_CODES.ETCO2, // EtCO2
  "8310-5", // Temp
  "72514-3", // Pain
]);

/**
 * Hydrates the full typed AnesthesiaRecord for a surgical case from discrete FHIR resources.
 */
export async function hydrateAnesthesiaRecord(
  input: HydrateAnesthesiaRecordInput,
): Promise<AnesthesiaRecord> {
  const { caseId, provider, medplum, observations, medAdmins, events } = input;

  const resolvedMedAdmins =
    medAdmins ??
    (await medplum
      .searchResources("MedicationAdministration", [
        ["context", `Encounter/${caseId}`],
        ["_count", "100"],
      ])
      .catch(() => []));

  const resolvedObservations =
    observations ??
    (await medplum
      .searchResources("Observation", [
        ["encounter", `Encounter/${caseId}`],
        ["_count", "100"],
      ])
      .catch(() => []));

  // 1. Doses from MedicationAdministration
  const doses: readonly DrugDose[] = resolvedMedAdmins
    .map((m) => parseMedicationAdministration(m))
    .sort((a, b) => a.at.localeCompare(b.at));

  // 2. Vitals from Observation (category: vital-signs or matching LOINC codes)
  const vitalObs = resolvedObservations.filter((obs) => {
    const isVitalCategory = obs.category?.some((c) =>
      c.coding?.some((cod) => cod.code === "vital-signs"),
    );
    const code = obs.code.coding?.[0]?.code;
    return isVitalCategory || (code !== undefined && VITAL_SIGN_CODES.has(code));
  });
  const parsedVitals = parseVitalsObservations(vitalObs);

  // 3. Pre-anesthesia assessment
  const preEvalObs = resolvedObservations.find((obs) => {
    const isPreEvalCode = obs.code.coding?.[0]?.code === LOINC_CODES.ASA_PHYSICAL_STATUS;
    const hasMallampatiComp = obs.component?.some(
      (c) => c.code.coding?.[0]?.code === LOINC_CODES.MALLAMPATI_SCORE,
    );
    return isPreEvalCode && hasMallampatiComp;
  });
  const preAssessment: PreAnesthesiaAssessment | null = preEvalObs
    ? parsePreAnesthesiaObservation(preEvalObs)
    : null;

  // 4. Airway events
  const airwayEventObs = resolvedObservations.filter(
    (obs) => obs.code.coding?.[0]?.code === LOINC_CODES.AIRWAY_EVENT,
  );
  const airwayEvents: readonly AirwayEvent[] = airwayEventObs
    .map((obs) => parseAirwayEventObservation(obs))
    .sort((a, b) => a.at.localeCompare(b.at));

  // 5. Sedation milestones
  const sedationStart = events?.find((e) => e.type === "SEDATION_START")?.at;
  const sedationEnd = events?.find((e) => e.type === "SEDATION_END")?.at;

  // 6. Resolved provider
  const resolvedProvider: StaffRef =
    provider ??
    preAssessment?.assessedBy ??
    doses[0]?.by ?? {
      id: "anes-default",
      name: "Anesthesia Provider",
      initials: "AP",
    };

  return {
    caseId,
    provider: resolvedProvider,
    technique: "MAC",
    airway: { device: "nasal_cannula", o2Lpm: 2 },
    airwayEvents,
    sedationStart,
    sedationEnd,
    doses,
    vitals: parsedVitals,
    preAssessment,
  };
}
