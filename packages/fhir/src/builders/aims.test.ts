import { describe, expect, it } from "vitest";
import type {
  AirwayEvent,
  DrugDose,
  PreAnesthesiaAssessment,
  VitalsEntry,
} from "@asc/types";
import {
  buildAirwayEventObservation,
  buildIntraopVitalsObservations,
  buildMedicationAdministration,
  buildPreAnesthesiaObservation,
  parseAirwayEventObservation,
  parseMedicationAdministration,
  parsePreAnesthesiaObservation,
  parseVitalsObservations,
} from "./aims.js";
import { LOINC_CODES } from "../urls.js";
import { extensionUrls } from "../extensions.js";

const FACILITY_ID = "fac-austin-south";
const CASE_ID = "case-2026-001";
const PATIENT_ID = "pat-1001";

describe("fhir/builders/aims (Phase P20, US-E-05, US-F-08, US-F-09)", () => {
  describe("MedicationAdministration (US-F-08, DEA 21 CFR § 1304.22(c))", () => {
    it("builds and parses a standard drug dose", () => {
      const dose: DrugDose = {
        id: "dose-prop-1",
        drug: "propofol",
        amount: 50,
        unit: "mg",
        route: "IV",
        at: "2026-10-16T08:15:00.000Z",
        by: { id: "anes-1", name: "Dr. Chen", initials: "RC" },
      };

      const res = buildMedicationAdministration(dose, CASE_ID, FACILITY_ID, "client-uuid-1", PATIENT_ID);

      expect(res.resourceType).toBe("MedicationAdministration");
      expect(res.status).toBe("completed");
      expect(res.meta?.accounts?.[0]?.reference).toBe(`Organization/${FACILITY_ID}`);
      expect(res.context?.reference).toBe(`Encounter/${CASE_ID}`);
      expect(res.subject.reference).toBe(`Patient/${PATIENT_ID}`);
      expect(res.effectiveDateTime).toBe("2026-10-16T08:15:00.000Z");
      expect(res.dosage?.dose?.value).toBe(50);
      expect(res.dosage?.dose?.unit).toBe("mg");
      expect(res.identifier?.[0]?.value).toBe("client-uuid-1");

      const roundTrip = parseMedicationAdministration(res);
      expect(roundTrip.drug).toBe("propofol");
      expect(roundTrip.amount).toBe(50);
      expect(roundTrip.unit).toBe("mg");
      expect(roundTrip.route).toBe("IV");
      expect(roundTrip.at).toBe("2026-10-16T08:15:00.000Z");
      expect(roundTrip.by.id).toBe("anes-1");
      expect(roundTrip.waste).toBeUndefined();
    });

    it("builds and parses controlled substance dose with witness waste", () => {
      const dose: DrugDose = {
        id: "dose-fent-1",
        drug: "fentanyl",
        amount: 100,
        unit: "mcg",
        route: "IV",
        at: "2026-10-16T08:10:00.000Z",
        by: { id: "anes-1", name: "Dr. Chen", initials: "RC" },
        waste: {
          drug: "fentanyl",
          administeredAmount: 100,
          wastedAmount: 100,
          unit: "mcg",
          witnessedBy: { id: "nurse-circ-1", name: "Sarah Miller, RN", initials: "SM" },
          witnessedAt: "2026-10-16T08:10:00.000Z",
          reason: "Partial vial discarded in sharps container with RN witness",
        },
      };

      const res = buildMedicationAdministration(dose, CASE_ID, FACILITY_ID, undefined, PATIENT_ID);
      expect(res.extension).toBeDefined();

      const roundTrip = parseMedicationAdministration(res);
      expect(roundTrip.drug).toBe("fentanyl");
      expect(roundTrip.waste).toBeDefined();
      expect(roundTrip.waste?.drug).toBe("fentanyl");
      expect(roundTrip.waste?.administeredAmount).toBe(100);
      expect(roundTrip.waste?.wastedAmount).toBe(100);
      expect(roundTrip.waste?.witnessedBy.id).toBe("nurse-circ-1");
      expect(roundTrip.waste?.witnessedBy.name).toBe("Sarah Miller, RN");
      expect(roundTrip.waste?.reason).toContain("Partial vial discarded");
    });
  });

  describe("Intra-op Vitals Observations (US-F-09, ASA Basic Monitoring Standards)", () => {
    it("builds discrete LOINC vital sign observations and parses them back", () => {
      const vitals: VitalsEntry = {
        id: "vit-1",
        caseId: CASE_ID,
        context: "intra",
        recordedAt: "2026-10-16T08:20:00.000Z",
        hr: 76,
        sbp: 122,
        dbp: 78,
        spo2: 99,
        rr: 14,
        etco2: 38,
        tempC: 36.8,
        pain: 0,
        recordedBy: { id: "anes-1", name: "Dr. Chen", initials: "RC" },
      };

      const observations = buildIntraopVitalsObservations(vitals, CASE_ID, FACILITY_ID, "vital-uuid-1", PATIENT_ID);

      expect(observations.length).toBe(8); // sbp, dbp, hr, rr, spo2, etco2, tempC, pain
      expect(observations.every((o) => o.resourceType === "Observation")).toBe(true);
      expect(observations.every((o) => o.meta?.accounts?.[0]?.reference === `Organization/${FACILITY_ID}`)).toBe(true);
      expect(observations.every((o) => o.encounter?.reference === `Encounter/${CASE_ID}`)).toBe(true);

      const etco2Obs = observations.find((o) => o.code.coding?.[0]?.code === LOINC_CODES.ETCO2);
      expect(etco2Obs).toBeDefined();
      expect(etco2Obs?.valueQuantity?.value).toBe(38);
      expect(etco2Obs?.valueQuantity?.unit).toBe("mmHg");

      const parsedVitals = parseVitalsObservations(observations);
      expect(parsedVitals).toHaveLength(1);
      const parsed = parsedVitals[0]!;
      expect(parsed.recordedAt).toBe("2026-10-16T08:20:00.000Z");
      expect(parsed.sbp).toBe(122);
      expect(parsed.dbp).toBe(78);
      expect(parsed.hr).toBe(76);
      expect(parsed.spo2).toBe(99);
      expect(parsed.etco2).toBe(38);
      expect(parsed.tempC).toBe(36.8);
      expect(parsed.pain).toBe(0);
    });
  });

  describe("Pre-Anesthesia Assessment Observation (US-E-05, CMS 42 CFR § 416.42(a))", () => {
    it("builds discrete pre-anesthesia observation and parses it back", () => {
      const assessment: PreAnesthesiaAssessment = {
        asaClass: 3,
        mallampati: 2,
        airwayNotes: "Adequate mouth opening, Mallampati II airway",
        lastOralIntakeIso: "2026-10-16T00:00:00.000Z",
        npoStatusSatisfied: true,
        assessedAt: "2026-10-16T08:00:00.000Z",
        assessedBy: { id: "anes-1", name: "Dr. Chen", initials: "RC" },
      };

      const obs = buildPreAnesthesiaObservation(assessment, CASE_ID, FACILITY_ID, PATIENT_ID);

      expect(obs.resourceType).toBe("Observation");
      expect(obs.code.coding?.[0]?.code).toBe(LOINC_CODES.ASA_PHYSICAL_STATUS);
      expect(obs.meta?.accounts?.[0]?.reference).toBe(`Organization/${FACILITY_ID}`);
      expect(obs.component?.length).toBe(5);

      const parsed = parsePreAnesthesiaObservation(obs);
      expect(parsed.asaClass).toBe(3);
      expect(parsed.mallampati).toBe(2);
      expect(parsed.npoStatusSatisfied).toBe(true);
      expect(parsed.lastOralIntakeIso).toBe("2026-10-16T00:00:00.000Z");
      expect(parsed.airwayNotes).toBe("Adequate mouth opening, Mallampati II airway");
      expect(parsed.assessedBy.id).toBe("anes-1");
    });
  });

  describe("Airway Event Observation", () => {
    it("builds and parses airway event observation", () => {
      const event: AirwayEvent = {
        id: "airway-ev-1",
        type: "jaw_thrust",
        at: "2026-10-16T08:25:00.000Z",
        note: "Transient snoring relieved with gentle jaw thrust",
      };

      const obs = buildAirwayEventObservation(event, CASE_ID, FACILITY_ID, PATIENT_ID);

      expect(obs.resourceType).toBe("Observation");
      expect(obs.code.coding?.[0]?.code).toBe(LOINC_CODES.AIRWAY_EVENT);
      expect(obs.valueCodeableConcept?.coding?.[0]?.code).toBe("jaw_thrust");

      const parsed = parseAirwayEventObservation(obs);
      expect(parsed.id).toBe("airway-ev-1");
      expect(parsed.type).toBe("jaw_thrust");
      expect(parsed.note).toContain("Transient snoring");
    });

    it("handles minimal airway event without note or patientId", () => {
      const event: AirwayEvent = {
        id: "airway-ev-2",
        type: "airway_inserted",
        at: "2026-10-16T08:26:00.000Z",
      };

      const obs = buildAirwayEventObservation(event, CASE_ID, FACILITY_ID);
      expect(obs.id).toBe("airway-ev-2");
      expect(obs.note).toBeUndefined();
      expect(obs.subject?.reference).toBe(`Patient/${CASE_ID}`);

      const parsed = parseAirwayEventObservation({
        resourceType: "Observation",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: LOINC_CODES.AIRWAY_EVENT }] },
      });
      expect(parsed.id).toBe("airway-event-temp");
      expect(parsed.type).toBe("jaw_thrust");
      expect(parsed.note).toBeUndefined();
    });

    it("attaches aimsClientIdIdentifier when clientId is provided in options", () => {
      const event: AirwayEvent = {
        id: "airway-ev-3",
        type: "chin_lift",
        at: "2026-10-16T08:27:00.000Z",
      };
      const obs = buildAirwayEventObservation(event, CASE_ID, FACILITY_ID, {
        clientId: "client-airway-uuid-99",
        patientId: PATIENT_ID,
      });
      expect(obs.identifier).toBeDefined();
      expect(obs.identifier?.[0]?.value).toBe("client-airway-uuid-99");
      expect(obs.subject?.reference).toBe(`Patient/${PATIENT_ID}`);
    });

    it("handles options object without clientId or patientId", () => {
      const event: AirwayEvent = {
        id: "airway-ev-4",
        type: "chin_lift",
        at: "2026-10-16T08:28:00.000Z",
      };
      const obs = buildAirwayEventObservation(event, CASE_ID, FACILITY_ID, {});
      expect(obs.identifier).toBeUndefined();
      expect(obs.subject?.reference).toBe(`Patient/${CASE_ID}`);
    });
  });

  describe("Edge cases & branch coverage", () => {
    it("parses MedicationAdministration matching RxNorm code when text is missing", () => {
      const parsed = parseMedicationAdministration({
        resourceType: "MedicationAdministration",
        status: "completed",
        medicationCodeableConcept: {
          coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "6960" }], // midazolam
        },
        subject: { reference: `Patient/${PATIENT_ID}` },
        effectiveDateTime: "2026-10-16T08:12:00.000Z",
      });

      expect(parsed.drug).toBe("midazolam");
      expect(parsed.amount).toBe(0);
      expect(parsed.unit).toBe("mg");
      expect(parsed.by.id).toBe("unknown-performer");
      expect(parsed.by.name).toBe("Anesthesia Provider");
    });

    it("falls back to default drug when coding is unmapped and text is missing", () => {
      const parsed = parseMedicationAdministration({
        resourceType: "MedicationAdministration",
        status: "completed",
        medicationCodeableConcept: {
          coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "9999999" }],
        },
        subject: { reference: `Patient/${PATIENT_ID}` },
      });

      expect(parsed.drug).toBe("propofol");
      expect(parsed.id).toBe("dose-temp");
    });

    it("builds minimal MedicationAdministration without id, clientId, or patientId", () => {
      const dose: DrugDose = {
        id: "dose-eph-1",
        drug: "ephedrine",
        amount: 25,
        unit: "mg",
        route: "IV",
        at: "2026-10-16T08:14:00.000Z",
        by: { id: "anes-2", name: "Jane Smith", initials: "JS" },
      };

      const res = buildMedicationAdministration(dose, CASE_ID, FACILITY_ID);
      expect(res.id).toBe("dose-eph-1");
      expect(res.identifier).toBeUndefined();
      expect(res.subject?.reference).toBe(`Patient/${CASE_ID}`);
      expect(res.extension).toBeUndefined();
    });

    it("parses waste extension with fallback defaults when optional waste fields are missing", () => {
      const parsed = parseMedicationAdministration({
        resourceType: "MedicationAdministration",
        status: "completed",
        subject: { reference: `Patient/${PATIENT_ID}` },
        extension: [
          {
            url: extensionUrls.controlledSubstanceWaste,
            extension: [],
          },
        ],
      });

      expect(parsed.waste).toBeDefined();
      expect(parsed.waste?.drug).toBe("propofol");
      expect(parsed.waste?.administeredAmount).toBe(0);
      expect(parsed.waste?.wastedAmount).toBe(0);
      expect(parsed.waste?.unit).toBe("mg");
      expect(parsed.waste?.witnessedBy.id).toBe("");
      expect(parsed.waste?.witnessedBy.name).toBe("Witness RN");
      expect(parsed.waste?.reason).toBeUndefined();
    });

    it("builds and parses vitals with omitted fields and handles unknown observation codes", () => {
      const vitals: VitalsEntry = {
        id: "vit-partial",
        caseId: CASE_ID,
        context: "intra",
        recordedAt: "2026-10-16T08:30:00.000Z",
        hr: 80,
        sbp: 130,
        dbp: 85,
        spo2: 97,
        rr: 16,
        recordedBy: { id: "nurse-1", name: "Nurse", initials: "N" },
      };

      const observations = buildIntraopVitalsObservations(vitals, CASE_ID, FACILITY_ID);
      expect(observations.length).toBe(5); // hr, sbp, dbp, spo2, rr (no etco2, tempC, pain)
      expect(observations[0]?.identifier).toBeUndefined();
      expect(observations[0]?.subject?.reference).toBe(`Patient/${CASE_ID}`);

      // Add dummy observations: one without valueQuantity, one with unmapped code
      const augmented = [
        ...observations,
        {
          resourceType: "Observation" as const,
          status: "final" as const,
          code: { coding: [{ system: "http://loinc.org", code: "8480-6" }] },
          effectiveDateTime: "2026-10-16T08:30:00.000Z",
          performer: [{ reference: "Practitioner/nurse-1" }],
        },
        {
          resourceType: "Observation" as const,
          status: "final" as const,
          code: { coding: [{ system: "http://loinc.org", code: "UNKNOWN-CODE" }] },
          effectiveDateTime: "2026-10-16T08:30:00.000Z",
          valueQuantity: { value: 99 },
          performer: [{ reference: "Practitioner/nurse-1" }],
        },
      ];

      const parsed = parseVitalsObservations(augmented);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]?.hr).toBe(80);
      expect(parsed[0]?.etco2).toBeUndefined();
    });

    it("does not fabricate vitals when only non-cardiovascular observations are provided", () => {
      const nonCardioObs = [
        {
          resourceType: "Observation" as const,
          status: "final" as const,
          code: { coding: [{ system: "http://loinc.org", code: LOINC_CODES.ETCO2 }] },
          effectiveDateTime: "2026-10-16T08:30:00.000Z",
          valueQuantity: { value: 38 },
          performer: [{ reference: "Practitioner/nurse-1" }],
        },
      ];
      const parsed = parseVitalsObservations(nonCardioObs);
      expect(parsed).toEqual([]);
    });

    it("parses vital group with only heart rate", () => {
      const hrOnlyObs = [
        {
          resourceType: "Observation" as const,
          status: "final" as const,
          code: { coding: [{ system: "http://loinc.org", code: "8867-4" }] },
          effectiveDateTime: "2026-10-16T08:35:00.000Z",
          valueQuantity: { value: 72 },
          performer: [{ reference: "Practitioner/nurse-1" }],
        },
      ];
      const parsed = parseVitalsObservations(hrOnlyObs);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]?.hr).toBe(72);
      expect(parsed[0]?.sbp).toBe(0);
      expect(parsed[0]?.dbp).toBe(0);
    });

    it("builds and parses pre-anesthesia observation without airway notes and with out-of-range values", () => {
      const assessment: PreAnesthesiaAssessment = {
        asaClass: 2,
        mallampati: 1,
        lastOralIntakeIso: "2026-10-16T01:00:00.000Z",
        npoStatusSatisfied: false,
        assessedAt: "2026-10-16T07:55:00.000Z",
        assessedBy: { id: "anes-1", name: "Dr. Chen", initials: "RC" },
      };

      const obs = buildPreAnesthesiaObservation(assessment, CASE_ID, FACILITY_ID);
      expect(obs.component?.find((c) => c.code.text === "Airway notes")).toBeUndefined();
      expect(obs.subject?.reference).toBe(`Patient/${CASE_ID}`);

      const parsedEmpty = parsePreAnesthesiaObservation({
        resourceType: "Observation",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: LOINC_CODES.ASA_PHYSICAL_STATUS }] },
        component: [
          {
            code: { coding: [{ system: "http://loinc.org", code: LOINC_CODES.ASA_PHYSICAL_STATUS }] },
            valueInteger: 9, // out of range 1..5
          },
          {
            code: { coding: [{ system: "http://loinc.org", code: LOINC_CODES.MALLAMPATI_SCORE }] },
            valueInteger: 9, // out of range 1..4
          },
        ],
      });
      expect(parsedEmpty.asaClass).toBe(2);
      expect(parsedEmpty.mallampati).toBe(1);
      expect(parsedEmpty.airwayNotes).toBeUndefined();
      expect(parsedEmpty.assessedBy.id).toBe("anesthesiologist");
    });

    it("builds MedicationAdministration with waste without reason", () => {
      const dose: DrugDose = {
        id: "dose-fent-waste-noreason",
        drug: "fentanyl",
        amount: 50,
        unit: "mcg",
        route: "IV",
        at: "2026-10-16T08:15:00.000Z",
        by: { id: "anes-1", name: "Dr. Chen", initials: "RC" },
        waste: {
          drug: "fentanyl",
          administeredAmount: 50,
          wastedAmount: 50,
          unit: "mcg",
          witnessedBy: { id: "rn-1", name: "Witness RN", initials: "WR" },
          witnessedAt: "2026-10-16T08:15:00.000Z",
        },
      };
      const res = buildMedicationAdministration(dose, CASE_ID, FACILITY_ID);
      expect(res.extension?.[0]?.extension?.find((e) => e.url === "reason")).toBeUndefined();
    });

    it("parses multiple vitals entries sorting chronologically and handles missing encounter/effectiveDateTime/performer", () => {
      const obs1 = {
        resourceType: "Observation" as const,
        status: "final" as const,
        code: { coding: [{ system: "http://loinc.org", code: "8480-6" }] },
        valueQuantity: { value: 120 },
      };
      const obs2 = {
        resourceType: "Observation" as const,
        status: "final" as const,
        code: { coding: [{ system: "http://loinc.org", code: "8480-6" }] },
        effectiveDateTime: "2026-10-16T09:00:00.000Z",
        performer: [{ reference: "Practitioner/dr-x" }],
        encounter: { reference: "Encounter/case-123" },
        valueQuantity: { value: 130 },
      };
      const entries = parseVitalsObservations([obs2, obs1]);
      expect(entries).toHaveLength(2);
      expect(entries[0]?.caseId).toBeDefined();
    });

    it("parses pre-anesthesia observation with undefined component and foreign systems", () => {
      const obsWithUndefinedComponent = {
        resourceType: "Observation" as const,
        status: "final" as const,
        code: { coding: [{ system: "http://loinc.org", code: LOINC_CODES.ASA_PHYSICAL_STATUS }] },
      };
      const p1 = parsePreAnesthesiaObservation(obsWithUndefinedComponent);
      expect(p1.asaClass).toBe(2);

      const obsWithForeignSystems = {
        resourceType: "Observation" as const,
        status: "final" as const,
        code: { coding: [{ system: "http://loinc.org", code: LOINC_CODES.ASA_PHYSICAL_STATUS }] },
        component: [
          {
            code: { coding: [{ system: "http://foreign-system.org", code: "some-code" }] },
            valueString: "foreign",
          },
          {
            code: { coding: [{ system: "https://fhir.wybit.io/asc/CodeSystem/pre-anesthesia-component", code: "unknown-code" }] },
            valueString: "unknown",
          },
        ],
      };
      const p2 = parsePreAnesthesiaObservation(obsWithForeignSystems);
      expect(p2.airwayNotes).toBeUndefined();
    });
  });
});

