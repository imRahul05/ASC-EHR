import { describe, expect, it } from "vitest";
import {
  aimsBatchSchema,
  aimsVitalsPayloadSchema,
  anesthesiaEntrySchema,
  controlledSubstanceWasteSchema,
  preAnesthesiaAssessmentSchema,
} from "../aims.schema.js";

describe("aims.schema (Phase P20, US-E-05, US-F-08, US-F-09)", () => {
  describe("preAnesthesiaAssessmentSchema (CMS 42 CFR § 416.42(a))", () => {
    it("accepts valid pre-anesthesia assessment across ASA classes 1-5 and Mallampati 1-4", () => {
      const validPayload = {
        asaClass: 2,
        mallampati: 2,
        airwayNotes: "Normal thyromental distance, full neck mobility",
        lastOralIntakeIso: "2026-10-16T02:00:00.000Z",
        npoStatusSatisfied: true,
        assessedAt: "2026-10-16T08:00:00.000Z",
        assessedBy: {
          id: "staff-anes-1",
          name: "Dr. Robert Chen, MD",
          initials: "RC",
        },
      };

      const parsed = preAnesthesiaAssessmentSchema.parse(validPayload);
      expect(parsed.asaClass).toBe(2);
      expect(parsed.mallampati).toBe(2);
      expect(parsed.npoStatusSatisfied).toBe(true);
      expect(parsed.assessedBy?.initials).toBe("RC");
    });

    it("accepts minimum required fields without optional notes and assessor", () => {
      const minPayload = {
        asaClass: 1,
        mallampati: 1,
        lastOralIntakeIso: "2026-10-16T00:00:00.000Z",
        npoStatusSatisfied: true,
      };

      const parsed = preAnesthesiaAssessmentSchema.parse(minPayload);
      expect(parsed.asaClass).toBe(1);
      expect(parsed.airwayNotes).toBeUndefined();
    });

    it("rejects invalid ASA class values outside 1-5", () => {
      expect(() =>
        preAnesthesiaAssessmentSchema.parse({
          asaClass: 6,
          mallampati: 1,
          lastOralIntakeIso: "2026-10-16T00:00:00.000Z",
          npoStatusSatisfied: true,
        }),
      ).toThrow();

      expect(() =>
        preAnesthesiaAssessmentSchema.parse({
          asaClass: 0,
          mallampati: 1,
          lastOralIntakeIso: "2026-10-16T00:00:00.000Z",
          npoStatusSatisfied: true,
        }),
      ).toThrow();
    });

    it("rejects invalid Mallampati scores outside 1-4", () => {
      expect(() =>
        preAnesthesiaAssessmentSchema.parse({
          asaClass: 2,
          mallampati: 5,
          lastOralIntakeIso: "2026-10-16T00:00:00.000Z",
          npoStatusSatisfied: true,
        }),
      ).toThrow();
    });

    it("rejects airway notes exceeding 500 characters", () => {
      expect(() =>
        preAnesthesiaAssessmentSchema.parse({
          asaClass: 3,
          mallampati: 3,
          airwayNotes: "A".repeat(501),
          lastOralIntakeIso: "2026-10-16T00:00:00.000Z",
          npoStatusSatisfied: true,
        }),
      ).toThrow();
    });

    it("rejects invalid ISO datetime strings", () => {
      expect(() =>
        preAnesthesiaAssessmentSchema.parse({
          asaClass: 2,
          mallampati: 2,
          lastOralIntakeIso: "not-an-iso-date",
          npoStatusSatisfied: true,
        }),
      ).toThrow();
    });
  });

  describe("controlledSubstanceWasteSchema (DEA 21 CFR § 1304.22(c))", () => {
    it("accepts valid controlled substance waste attestation", () => {
      const validWaste = {
        drug: "fentanyl",
        administeredAmount: 100,
        wastedAmount: 100,
        unit: "mcg",
        witnessedBy: {
          id: "nurse-circ-1",
          name: "Sarah Miller, RN",
          initials: "SM",
        },
        witnessedAt: "2026-10-16T08:15:00.000Z",
        reason: "Partial vial discarded in sharps container with witness",
      };

      const parsed = controlledSubstanceWasteSchema.parse(validWaste);
      expect(parsed.drug).toBe("fentanyl");
      expect(parsed.wastedAmount).toBe(100);
      expect(parsed.witnessedBy.initials).toBe("SM");
    });

    it("rejects zero or negative administered amount", () => {
      expect(() =>
        controlledSubstanceWasteSchema.parse({
          drug: "midazolam",
          administeredAmount: 0,
          wastedAmount: 2,
          unit: "mg",
          witnessedBy: { id: "n1", name: "Nurse", initials: "N" },
          witnessedAt: "2026-10-16T08:15:00.000Z",
        }),
      ).toThrow();
    });

    it("rejects negative wasted amount", () => {
      expect(() =>
        controlledSubstanceWasteSchema.parse({
          drug: "midazolam",
          administeredAmount: 2,
          wastedAmount: -1,
          unit: "mg",
          witnessedBy: { id: "n1", name: "Nurse", initials: "N" },
          witnessedAt: "2026-10-16T08:15:00.000Z",
        }),
      ).toThrow();
    });

    it("rejects invalid drug or dose unit", () => {
      expect(() =>
        controlledSubstanceWasteSchema.parse({
          drug: "aspirin",
          administeredAmount: 10,
          wastedAmount: 5,
          unit: "mg",
          witnessedBy: { id: "n1", name: "Nurse", initials: "N" },
          witnessedAt: "2026-10-16T08:15:00.000Z",
        }),
      ).toThrow();
    });
  });

  describe("anesthesiaEntrySchema (ASA Monitoring Standards)", () => {
    it("validates dose entry with emergency reversal agents", () => {
      const dose = anesthesiaEntrySchema.parse({
        kind: "dose",
        drug: "naloxone",
        amount: 0.4,
        unit: "mg",
        at: "2026-10-16T08:30:00.000Z",
      });

      expect(dose.kind).toBe("dose");
      if (dose.kind === "dose") {
        expect(dose.drug).toBe("naloxone");
        expect(dose.amount).toBe(0.4);
      }
    });

    it("validates vitals entry with continuous EtCO2 capnography", () => {
      const vitals = anesthesiaEntrySchema.parse({
        kind: "vitals",
        vitals: {
          context: "intra",
          hr: 72,
          sbp: 120,
          dbp: 80,
          spo2: 99,
          rr: 14,
          etco2: 38,
          tempC: 36.8,
          pain: 0,
          recordedAt: "2026-10-16T08:20:00.000Z",
        },
      });

      expect(vitals.kind).toBe("vitals");
      if (vitals.kind === "vitals") {
        expect(vitals.vitals.etco2).toBe(38);
        expect(vitals.vitals.spo2).toBe(99);
      }
    });

    it("rejects physiological out-of-range vitals", () => {
      // HR below physiological min
      expect(() =>
        aimsVitalsPayloadSchema.parse({
          hr: 15,
          sbp: 120,
          dbp: 80,
          spo2: 98,
          rr: 12,
        }),
      ).toThrow();

      // SpO2 over 100%
      expect(() =>
        aimsVitalsPayloadSchema.parse({
          hr: 75,
          sbp: 120,
          dbp: 80,
          spo2: 105,
          rr: 12,
        }),
      ).toThrow();

      // EtCO2 over 100 mmHg
      expect(() =>
        aimsVitalsPayloadSchema.parse({
          hr: 75,
          sbp: 120,
          dbp: 80,
          spo2: 98,
          rr: 12,
          etco2: 120,
        }),
      ).toThrow();
    });

    it("validates airway event, sedation edge, and setup entries", () => {
      const airway = anesthesiaEntrySchema.parse({
        kind: "airway_event",
        type: "jaw_thrust",
        note: "Transient snoring resolved with maneuver",
      });
      expect(airway.kind).toBe("airway_event");

      const sedation = anesthesiaEntrySchema.parse({
        kind: "sedation",
        edge: "start",
        at: "2026-10-16T08:10:00.000Z",
      });
      expect(sedation.kind).toBe("sedation");

      const setup = anesthesiaEntrySchema.parse({
        kind: "setup",
        technique: "MAC",
        device: "nasal_cannula",
        o2Lpm: 3,
      });
      expect(setup.kind).toBe("setup");
    });

    it("accepts valid controlled substance waste matching drug, unit, and administeredAmount", () => {
      const doseWithWaste = anesthesiaEntrySchema.parse({
        kind: "dose",
        drug: "fentanyl",
        amount: 50,
        unit: "mcg",
        at: "2026-10-16T08:15:00.000Z",
        waste: {
          drug: "fentanyl",
          administeredAmount: 50,
          wastedAmount: 50,
          unit: "mcg",
          witnessedBy: {
            id: "nurse-456",
            name: "Sarah Jenkins, RN",
            initials: "SJ",
          },
          witnessedAt: "2026-10-16T08:16:00.000Z",
          reason: "Partial vial discarded",
        },
      });
      expect(doseWithWaste.kind).toBe("dose");
      if (doseWithWaste.kind === "dose") {
        expect(doseWithWaste.waste?.wastedAmount).toBe(50);
      }
    });

    it("rejects dose entry if waste drug does not match dose drug", () => {
      expect(() =>
        anesthesiaEntrySchema.parse({
          kind: "dose",
          drug: "fentanyl",
          amount: 50,
          unit: "mcg",
          waste: {
            drug: "midazolam",
            administeredAmount: 50,
            wastedAmount: 50,
            unit: "mcg",
            witnessedBy: { id: "nurse-456", name: "Sarah Jenkins, RN", initials: "SJ" },
            witnessedAt: "2026-10-16T08:16:00.000Z",
          },
        }),
      ).toThrow("Wasted drug must match the administered drug");
    });

    it("rejects dose entry if waste unit does not match dose unit", () => {
      expect(() =>
        anesthesiaEntrySchema.parse({
          kind: "dose",
          drug: "midazolam",
          amount: 2,
          unit: "mg",
          waste: {
            drug: "midazolam",
            administeredAmount: 2,
            wastedAmount: 3,
            unit: "mcg",
            witnessedBy: { id: "nurse-456", name: "Sarah Jenkins, RN", initials: "SJ" },
            witnessedAt: "2026-10-16T08:16:00.000Z",
          },
        }),
      ).toThrow("Wasted dose unit must match the administered dose unit");
    });

    it("rejects dose entry if waste administeredAmount does not match dose amount", () => {
      expect(() =>
        anesthesiaEntrySchema.parse({
          kind: "dose",
          drug: "fentanyl",
          amount: 50,
          unit: "mcg",
          waste: {
            drug: "fentanyl",
            administeredAmount: 25,
            wastedAmount: 75,
            unit: "mcg",
            witnessedBy: { id: "nurse-456", name: "Sarah Jenkins, RN", initials: "SJ" },
            witnessedAt: "2026-10-16T08:16:00.000Z",
          },
        }),
      ).toThrow("Wasted administered amount must match the dose amount");
    });
  });

  describe("aimsBatchSchema (NFR-14 Offline Batch Synchronization)", () => {
    it("accepts valid batch of offline entries with facilityId and userId", () => {
      const batch = aimsBatchSchema.parse({
        entries: [
          {
            clientId: "c28fa485-8025-46b5-9e32-2d1f7362a933",
            caseId: "case-123",
            facilityId: "facility-main",
            userId: "anesth-789",
            payload: {
              kind: "sedation",
              edge: "start",
              at: "2026-10-16T08:10:00.000Z",
            },
            recordedAt: "2026-10-16T08:10:00.000Z",
          },
          {
            clientId: "9a23c4a2-97bd-4dd4-9169-bc94c39dc53e",
            payload: {
              kind: "dose",
              drug: "propofol",
              amount: 50,
              unit: "mg",
              at: "2026-10-16T08:11:00.000Z",
            },
            recordedAt: "2026-10-16T08:11:00.000Z",
          },
        ],
      });

      expect(batch.entries).toHaveLength(2);
      expect(batch.entries[0]?.clientId).toBe("c28fa485-8025-46b5-9e32-2d1f7362a933");
      expect(batch.entries[0]?.facilityId).toBe("facility-main");
      expect(batch.entries[0]?.userId).toBe("anesth-789");
    });

    it("rejects empty batch (minimum 1 entry)", () => {
      expect(() => aimsBatchSchema.parse({ entries: [] })).toThrow();
    });

    it("rejects invalid UUID clientId", () => {
      expect(() =>
        aimsBatchSchema.parse({
          entries: [
            {
              clientId: "not-a-valid-uuid",
              payload: { kind: "sedation", edge: "start" },
              recordedAt: "2026-10-16T08:10:00.000Z",
            },
          ],
        }),
      ).toThrow();
    });
  });
});
