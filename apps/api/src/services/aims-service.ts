/**
 * AIMS Anesthesia Service.
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

import { randomUUID } from "node:crypto";
import { forFacility } from "@asc/api-client/server";
import { evaluatePreAnesthesiaReadiness } from "@asc/clinical-rules/aims/pre-anesthesia";
import {
  buildAirwayEventObservation,
  buildIntraopVitalsObservations,
  buildMedicationAdministration,
  buildPreAnesthesiaObservation,
  buildProcedureEventObservation,
  caseReadinessExtension,
  createExtensionUrls,
  fhirUrls,
} from "@asc/fhir";
import type {
  AimsBatchSyncResult,
  AirwayEvent,
  AnesthesiaRecord,
  DrugDose,
  PreAnesthesiaAssessment,
  ProcedureEvent,
  ProcedureEventType,
  RuleReason,
  StaffRef,
  VitalsContext,
  VitalsEntry,
} from "@asc/types";
import type {
  AimsBatchInput,
  AnesthesiaEntryInput,
  PreAnesthesiaAssessmentInput,
} from "@asc/validation";
import type { MedplumClient } from "@medplum/core";
import type { Encounter, Extension } from "@medplum/fhirtypes";
import type { FastifyBaseLogger } from "fastify";
import { getCaseDetail } from "./case-read-service.js";

type AimsResult<T> =
  | { readonly status: 200; readonly data: T }
  | { readonly status: 404; readonly code: "not_found"; readonly message: string }
  | {
      readonly status: 409;
      readonly code: "GATE_FAILED";
      readonly message: string;
      readonly reasons?: readonly RuleReason[];
    };

function toVitalsContext(context?: "pre" | "intra" | "post"): VitalsContext {
  if (context === "pre") return "pre_op";
  if (context === "post") return "pacu";
  return "intra";
}

/**
 * Retrieves the fully hydrated AnesthesiaRecord for a case.
 */
export async function getCaseAnesthesiaRecord(params: {
  medplum: MedplumClient;
  facilityId: string;
  caseId: string;
}): Promise<AimsResult<AnesthesiaRecord>> {
  const detail = await getCaseDetail(params);
  if (!detail) {
    return { status: 404, code: "not_found", message: `Case ${params.caseId} not found` };
  }
  return { status: 200, data: detail.anesthesia };
}

/**
 * Records a single discrete anesthesia entry (dose, vitals, airway event, sedation milestone, setup).
 * When sedation start is charted, enforces CMS 42 CFR § 416.42(a) pre-anesthesia evaluation gate.
 */
export async function recordAnesthesiaEntry(params: {
  medplum: MedplumClient;
  facilityId: string;
  caseId: string;
  input: AnesthesiaEntryInput;
  actor: StaffRef;
  logger: FastifyBaseLogger;
  clientId?: string;
}): Promise<AimsResult<AnesthesiaRecord>> {
  const { medplum, facilityId, caseId, input, actor, logger, clientId } = params;

  const currentDetail = await getCaseDetail({ medplum, facilityId, caseId });
  if (!currentDetail) {
    return { status: 404, code: "not_found", message: `Case ${caseId} not found` };
  }

  const patientId = currentDetail.patient.id;
  const facilityClient = forFacility(medplum, facilityId);

  // Hard gate check: pre-anesthesia evaluation required before sedation start (CMS 42 CFR § 416.42(a))
  if (input.kind === "sedation" && input.edge === "start") {
    const preAssessment = currentDetail.anesthesia.preAssessment;
    const readiness = evaluatePreAnesthesiaReadiness(preAssessment ?? undefined);
    if (!readiness.ok) {
      logger.warn(
        { caseId, reasons: readiness.reasons },
        "Sedation start blocked: pre-anesthesia evaluation missing or incomplete",
      );
      return {
        status: 409,
        code: "GATE_FAILED",
        message:
          "Pre-anesthesia evaluation must be completed before starting sedation (CMS 42 CFR § 416.42(a))",
        reasons: readiness.reasons,
      };
    }
  }

  // Persist discrete FHIR resource based on entry kind
  if (input.kind === "dose") {
    const dose: DrugDose = {
      id: `dose-${randomUUID()}`,
      drug: input.drug,
      amount: input.amount,
      unit: input.unit,
      route: "IV",
      at: input.at ?? new Date().toISOString(),
      by: actor,
      waste: input.waste,
    };
    const res = buildMedicationAdministration(dose, caseId, facilityId, clientId, patientId);
    await facilityClient.create(res);
  } else if (input.kind === "vitals") {
    const vitalsEntry: VitalsEntry = {
      id: `vit-${randomUUID()}`,
      caseId,
      context: toVitalsContext(input.vitals.context),
      recordedAt: input.vitals.recordedAt ?? new Date().toISOString(),
      hr: input.vitals.hr,
      sbp: input.vitals.sbp,
      dbp: input.vitals.dbp,
      spo2: input.vitals.spo2,
      rr: input.vitals.rr,
      etco2: input.vitals.etco2,
      tempC: input.vitals.tempC,
      pain: input.vitals.pain,
      recordedBy: actor,
    };
    const obsList = buildIntraopVitalsObservations(
      vitalsEntry,
      caseId,
      facilityId,
      clientId,
      patientId,
    );
    for (const obs of obsList) {
      await facilityClient.create(obs);
    }
  } else if (input.kind === "airway_event") {
    const event: AirwayEvent = {
      id: `airway-${randomUUID()}`,
      type: input.type,
      at: input.at ?? new Date().toISOString(),
      note: input.note,
    };
    const obs = buildAirwayEventObservation(event, caseId, facilityId, patientId);
    await facilityClient.create(obs);
  } else if (input.kind === "sedation") {
    const eventType: ProcedureEventType =
      input.edge === "start" ? "SEDATION_START" : "SEDATION_END";
    const event: ProcedureEvent = {
      id: `evt-${randomUUID()}`,
      caseId,
      type: eventType,
      at: input.at ?? new Date().toISOString(),
      by: actor,
    };
    const obs = buildProcedureEventObservation({
      facilityId,
      caseId,
      patientId,
      event,
    });
    await facilityClient.create(obs);
  }

  const updatedDetail = await getCaseDetail({ medplum, facilityId, caseId });
  return {
    status: 200,
    data: updatedDetail?.anesthesia ?? currentDetail.anesthesia,
  };
}

/**
 * Records pre-anesthesia medical assessment and satisfies anesthesia_clearance readiness check (CMS 42 CFR § 416.42(a)).
 */
export async function recordPreAnesthesiaAssessment(params: {
  medplum: MedplumClient;
  facilityId: string;
  caseId: string;
  input: PreAnesthesiaAssessmentInput;
  actor: StaffRef;
  logger: FastifyBaseLogger;
}): Promise<AimsResult<PreAnesthesiaAssessment>> {
  const { medplum, facilityId, caseId, input, actor, logger } = params;

  let encounter: Encounter | null;
  try {
    encounter = await medplum.readResource("Encounter", caseId);
  } catch {
    const found = await medplum
      .searchResources("Encounter", [
        ["_id", caseId],
        ["_count", "1"],
      ])
      .catch(() => []);
    encounter = found[0] ?? null;
  }

  if (!encounter) {
    return { status: 404, code: "not_found", message: `Case ${caseId} not found` };
  }

  const patientId = encounter.subject?.reference?.replace("Patient/", "") ?? caseId;
  const facilityClient = forFacility(medplum, facilityId);

  const assessment: PreAnesthesiaAssessment = {
    asaClass: input.asaClass,
    mallampati: input.mallampati,
    airwayNotes: input.airwayNotes,
    lastOralIntakeIso: input.lastOralIntakeIso,
    npoStatusSatisfied: input.npoStatusSatisfied,
    assessedAt: input.assessedAt ?? new Date().toISOString(),
    assessedBy: input.assessedBy ?? actor,
  };

  // 1. Create discrete Observation
  const obs = buildPreAnesthesiaObservation(assessment, caseId, facilityId, patientId);
  await facilityClient.create(obs);

  // 2. Update Encounter readiness check: anesthesia_clearance = "satisfied"
  const existingExtensions = encounter.extension ?? [];
  const readinessTargetUrl = createExtensionUrls(fhirUrls).caseReadiness;

  const filteredExtensions = existingExtensions.filter((e: Extension) => {
    if (e.url === readinessTargetUrl) {
      const nameSub = e.extension?.find((sub) => sub.url === "name");
      if (nameSub?.valueCode === "anesthesia_clearance") {
        return false;
      }
    }
    return true;
  });

  const updatedExtensions: Extension[] = [
    ...filteredExtensions,
    caseReadinessExtension({
      name: "anesthesia_clearance",
      status: "satisfied",
      label: "Anesthesia clearance",
      details: `ASA ${assessment.asaClass}, Mallampati ${assessment.mallampati}, NPO ${assessment.npoStatusSatisfied ? "satisfied" : "unsatisfied"}`,
    }),
  ];

  const updatedEncounter: Encounter = {
    ...encounter,
    extension: updatedExtensions,
  };
  await facilityClient.update(updatedEncounter);

  logger.info(
    { caseId, asaClass: assessment.asaClass, mallampati: assessment.mallampati },
    "Pre-anesthesia evaluation recorded and anesthesia_clearance satisfied",
  );

  return { status: 200, data: assessment };
}

/**
 * Synchronizes an offline batch of AIMS entries with deduplication by clientId.
 */
export async function syncAimsBatch(params: {
  medplum: MedplumClient;
  facilityId: string;
  caseId: string;
  input: AimsBatchInput;
  actor: StaffRef;
  logger: FastifyBaseLogger;
}): Promise<AimsResult<AimsBatchSyncResult>> {
  const { medplum, facilityId, caseId, input, actor, logger } = params;

  const currentDetail = await getCaseDetail({ medplum, facilityId, caseId });
  if (!currentDetail) {
    return { status: 404, code: "not_found", message: `Case ${caseId} not found` };
  }

  const patientId = currentDetail.patient.id;
  const facilityClient = forFacility(medplum, facilityId);

  // Gather existing clientIds from MedicationAdministration and Observation resources
  const [existingObs, existingMedAdmins] = await Promise.all([
    medplum
      .searchResources("Observation", [
        ["encounter", `Encounter/${caseId}`],
        ["_count", "500"],
      ])
      .catch(() => []),
    medplum
      .searchResources("MedicationAdministration", [
        ["context", `Encounter/${caseId}`],
        ["_count", "500"],
      ])
      .catch(() => []),
  ]);

  const existingClientIds = new Set<string>();
  for (const res of [...existingObs, ...existingMedAdmins]) {
    for (const ident of res.identifier ?? []) {
      if (ident.value) {
        existingClientIds.add(ident.value);
      }
    }
  }

  let syncedCount = 0;
  let duplicateCount = 0;

  for (const entry of input.entries) {
    if (existingClientIds.has(entry.clientId)) {
      duplicateCount++;
      continue;
    }

    if (entry.payload.kind === "dose") {
      const dose: DrugDose = {
        id: `dose-${randomUUID()}`,
        drug: entry.payload.drug,
        amount: entry.payload.amount,
        unit: entry.payload.unit,
        route: "IV",
        at: entry.payload.at ?? entry.recordedAt,
        by: actor,
        waste: entry.payload.waste,
      };
      const res = buildMedicationAdministration(
        dose,
        caseId,
        facilityId,
        entry.clientId,
        patientId,
      );
      await facilityClient.create(res);
    } else if (entry.payload.kind === "vitals") {
      const vitalsEntry: VitalsEntry = {
        id: `vit-${randomUUID()}`,
        caseId,
        context: toVitalsContext(entry.payload.vitals.context),
        recordedAt: entry.payload.vitals.recordedAt ?? entry.recordedAt,
        hr: entry.payload.vitals.hr,
        sbp: entry.payload.vitals.sbp,
        dbp: entry.payload.vitals.dbp,
        spo2: entry.payload.vitals.spo2,
        rr: entry.payload.vitals.rr,
        etco2: entry.payload.vitals.etco2,
        tempC: entry.payload.vitals.tempC,
        pain: entry.payload.vitals.pain,
        recordedBy: actor,
      };
      const obsList = buildIntraopVitalsObservations(
        vitalsEntry,
        caseId,
        facilityId,
        entry.clientId,
        patientId,
      );
      for (const obs of obsList) {
        await facilityClient.create(obs);
      }
    } else if (entry.payload.kind === "airway_event") {
      const airwayEvent: AirwayEvent = {
        id: `airway-${randomUUID()}`,
        type: entry.payload.type,
        at: entry.payload.at ?? entry.recordedAt,
        note: entry.payload.note,
      };
      const obs = buildAirwayEventObservation(airwayEvent, caseId, facilityId, patientId);
      await facilityClient.create(obs);
    } else if (entry.payload.kind === "sedation") {
      const eventType: ProcedureEventType =
        entry.payload.edge === "start" ? "SEDATION_START" : "SEDATION_END";
      const event: ProcedureEvent = {
        id: `evt-${randomUUID()}`,
        caseId,
        type: eventType,
        at: entry.payload.at ?? entry.recordedAt,
        by: actor,
      };
      const obs = buildProcedureEventObservation({
        facilityId,
        caseId,
        patientId,
        event,
      });
      await facilityClient.create(obs);
    }

    existingClientIds.add(entry.clientId);
    syncedCount++;
  }

  logger.info({ caseId, syncedCount, duplicateCount }, "AIMS offline batch sync completed");

  return {
    status: 200,
    data: { syncedCount, duplicateCount },
  };
}
