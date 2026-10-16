import { forFacility } from "@asc/api-client/server";
import { facilityGrant, staffPrincipal } from "@asc/authz/testing";
import { caseReadinessExtensions, caseStageExtension } from "@asc/fhir";
import type { AnesthesiaRecord } from "@asc/types";
import type { Encounter, Patient } from "@medplum/fhirtypes";
import { afterEach, describe, expect, it } from "vitest";

import { CasesMockClient as MockClient } from "../testing/mock-medplum.js";
import { buildTestApp } from "../testing/test-app.js";

type Built = Awaited<ReturnType<typeof buildTestApp>>;
let built: Built | undefined;

afterEach(async () => {
  await built?.app.close();
  built = undefined;
});

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("AIMS Anesthesia Routes (Phase P20 / REQ-10, US-E-05, US-F-08, US-F-09)", () => {
  const facilityId = "fac-austin-south";
  const userAnes = "user-anes-1";
  const tokenAnes = "token-anes-1";
  const userNoAnes = "user-no-anes";
  const tokenNoAnes = "token-no-anes";

  async function setupApp(mockMedplum: MockClient): Promise<Built> {
    const appBuilt = await buildTestApp({
      medplumBaseUrl: "http://localhost:8203/",
      createMedplumClient: () => mockMedplum,
    });
    appBuilt.identity.addToken(
      tokenAnes,
      staffPrincipal(
        [facilityGrant(facilityId, ["anesthesia"], ["case.read", "anesthesia.document"])],
        userAnes,
      ),
    );
    appBuilt.identity.addToken(
      tokenNoAnes,
      staffPrincipal(
        [facilityGrant(facilityId, ["front-desk"], ["patient.read"])],
        userNoAnes,
      ),
    );
    return appBuilt;
  }

  async function seedCase(mockMedplum: MockClient, caseId: string) {
    const facilityClient = forFacility(mockMedplum, facilityId);

    const patient: Patient = await facilityClient.create({
      resourceType: "Patient",
      id: `pat-${caseId}`,
      name: [{ family: "Davis", given: ["Michael"] }],
      birthDate: "1968-05-12",
      gender: "male",
    });

    const encounter: Encounter = await facilityClient.create({
      resourceType: "Encounter",
      id: caseId,
      status: "in-progress",
      class: { code: "AMB" },
      subject: { reference: `Patient/${patient.id}` },
      extension: [
        caseStageExtension("in_room"),
        ...caseReadinessExtensions([
          { name: "identity", status: "satisfied", label: "Identity" },
          { name: "consent", status: "satisfied", label: "Consent" },
          { name: "hp", status: "satisfied", label: "H&P" },
          { name: "anesthesia_clearance", status: "pending", label: "Anesthesia pre-eval" },
        ]),
      ],
    });

    return { patient, encounter };
  }

  describe("GET /cases/:caseId/anesthesia", () => {
    it("returns 401 when unauthenticated", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "GET",
        url: "/cases/case-1/anesthesia",
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 when user lacks anesthesia.document capability", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      await seedCase(mockMedplum, "case-1");

      const res = await built.app.inject({
        method: "GET",
        url: "/cases/case-1/anesthesia",
        headers: {
          ...bearer(tokenNoAnes),
          "x-facility-id": facilityId,
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 404 when case does not exist", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);

      const res = await built.app.inject({
        method: "GET",
        url: "/cases/nonexistent-case/anesthesia",
        headers: {
          ...bearer(tokenAnes),
          "x-facility-id": facilityId,
        },
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 200 with hydrated anesthesia record", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      await seedCase(mockMedplum, "case-anes-ok");

      const res = await built.app.inject({
        method: "GET",
        url: "/cases/case-anes-ok/anesthesia",
        headers: {
          ...bearer(tokenAnes),
          "x-facility-id": facilityId,
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<AnesthesiaRecord>();
      expect(body.caseId).toBe("case-anes-ok");
      expect(body.technique).toBe("MAC");
      expect(body.doses).toEqual([]);
      expect(body.vitals).toEqual([]);
    });
  });

  describe("POST /cases/:caseId/anesthesia/pre-assessment", () => {
    it("returns 400 for invalid payload (e.g. asaClass out of range)", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      await seedCase(mockMedplum, "case-pre-fail");

      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-pre-fail/anesthesia/pre-assessment",
        headers: {
          ...bearer(tokenAnes),
          "x-facility-id": facilityId,
        },
        payload: {
          asaClass: 6, // invalid
          mallampati: 2,
          lastOralIntakeIso: "2026-10-16T00:00:00.000Z",
          npoStatusSatisfied: true,
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("records pre-anesthesia evaluation and satisfies anesthesia_clearance readiness", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      await seedCase(mockMedplum, "case-pre-ok");

      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-pre-ok/anesthesia/pre-assessment",
        headers: {
          ...bearer(tokenAnes),
          "x-facility-id": facilityId,
        },
        payload: {
          asaClass: 2,
          mallampati: 2,
          airwayNotes: "Mallampati class II, good mouth opening, teeth intact",
          lastOralIntakeIso: "2026-10-16T00:00:00.000Z",
          npoStatusSatisfied: true,
          assessedAt: "2026-10-16T08:00:00.000Z",
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json<{ asaClass: number; mallampati: number }>();
      expect(data.asaClass).toBe(2);
      expect(data.mallampati).toBe(2);

      // Verify hydrated record now shows preAssessment
      const getRes = await built.app.inject({
        method: "GET",
        url: "/cases/case-pre-ok/anesthesia",
        headers: {
          ...bearer(tokenAnes),
          "x-facility-id": facilityId,
        },
      });
      const record = getRes.json<AnesthesiaRecord>();
      expect(record.preAssessment).not.toBeNull();
      expect(record.preAssessment?.asaClass).toBe(2);
      expect(record.preAssessment?.mallampati).toBe(2);
    });
  });

  describe("POST /cases/:caseId/anesthesia", () => {
    it("enforces CMS 42 CFR § 416.42(a) pre-evaluation gate before sedation start", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      await seedCase(mockMedplum, "case-gate-blocked");

      // Attempt sedation start without pre-anesthesia evaluation
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-gate-blocked/anesthesia",
        headers: {
          ...bearer(tokenAnes),
          "x-facility-id": facilityId,
        },
        payload: {
          kind: "sedation",
          edge: "start",
          at: "2026-10-16T08:15:00.000Z",
        },
      });

      expect(res.statusCode).toBe(409);
      const body = res.json<{ code: string; message: string; reasons: Array<{ message: string }> }>();
      expect(body.code).toBe("GATE_FAILED");
      expect(body.message).toContain("Pre-anesthesia evaluation must be completed before starting sedation");
    });

    it("allows sedation start once pre-anesthesia evaluation is completed", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      await seedCase(mockMedplum, "case-gate-pass");

      // Complete pre-assessment first
      await built.app.inject({
        method: "POST",
        url: "/cases/case-gate-pass/anesthesia/pre-assessment",
        headers: {
          ...bearer(tokenAnes),
          "x-facility-id": facilityId,
        },
        payload: {
          asaClass: 2,
          mallampati: 1,
          lastOralIntakeIso: "2026-10-16T00:00:00.000Z",
          npoStatusSatisfied: true,
        },
      });

      // Now start sedation
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-gate-pass/anesthesia",
        headers: {
          ...bearer(tokenAnes),
          "x-facility-id": facilityId,
        },
        payload: {
          kind: "sedation",
          edge: "start",
          at: "2026-10-16T08:15:00.000Z",
        },
      });

      expect(res.statusCode).toBe(200);
      const record = res.json<AnesthesiaRecord>();
      expect(record.sedationStart).toBe("2026-10-16T08:15:00.000Z");
    });

    it("records drug dose with dual-witness controlled substance waste (DEA 21 CFR § 1304.22(c))", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      await seedCase(mockMedplum, "case-dose-waste");

      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-dose-waste/anesthesia",
        headers: {
          ...bearer(tokenAnes),
          "x-facility-id": facilityId,
        },
        payload: {
          kind: "dose",
          drug: "fentanyl",
          amount: 50,
          unit: "mcg",
          at: "2026-10-16T08:18:00.000Z",
          waste: {
            drug: "fentanyl",
            administeredAmount: 50,
            wastedAmount: 50,
            unit: "mcg",
            witnessedBy: { id: "nurse-circ", name: "Sarah Miller, RN", initials: "SM" },
            witnessedAt: "2026-10-16T08:18:00.000Z",
            reason: "Partial vial discarded",
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const record = res.json<AnesthesiaRecord>();
      expect(record.doses).toHaveLength(1);
      expect(record.doses[0]?.drug).toBe("fentanyl");
      expect(record.doses[0]?.amount).toBe(50);
      expect(record.doses[0]?.waste?.wastedAmount).toBe(50);
      expect(record.doses[0]?.waste?.witnessedBy.name).toBe("Sarah Miller, RN");
    });

    it("records 5-minute flowsheet vitals including EtCO2 capnography", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      await seedCase(mockMedplum, "case-vitals-etco2");

      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-vitals-etco2/anesthesia",
        headers: {
          ...bearer(tokenAnes),
          "x-facility-id": facilityId,
        },
        payload: {
          kind: "vitals",
          vitals: {
            context: "intra",
            hr: 74,
            sbp: 118,
            dbp: 76,
            spo2: 99,
            rr: 14,
            etco2: 36,
            tempC: 36.7,
            pain: 0,
            recordedAt: "2026-10-16T08:20:00.000Z",
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const record = res.json<AnesthesiaRecord>();
      expect(record.vitals).toHaveLength(1);
      expect(record.vitals[0]?.etco2).toBe(36);
      expect(record.vitals[0]?.hr).toBe(74);
    });

    it("records airway events (e.g. jaw thrust maneuver)", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      await seedCase(mockMedplum, "case-airway");

      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-airway/anesthesia",
        headers: {
          ...bearer(tokenAnes),
          "x-facility-id": facilityId,
        },
        payload: {
          kind: "airway_event",
          type: "jaw_thrust",
          note: "Transient snoring relieved with gentle jaw thrust",
          at: "2026-10-16T08:22:00.000Z",
        },
      });

      expect(res.statusCode).toBe(200);
      const record = res.json<AnesthesiaRecord>();
      expect(record.airwayEvents).toHaveLength(1);
      expect(record.airwayEvents[0]?.type).toBe("jaw_thrust");
      expect(record.airwayEvents[0]?.note).toContain("Transient snoring");
    });
  });

  describe("POST /cases/:caseId/aims/batch", () => {
    it("synchronizes batch entries and deduplicates replayed clientIds", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      await seedCase(mockMedplum, "case-batch-sync");

      const entry1 = {
        clientId: "11111111-1111-4111-8111-111111111111",
        recordedAt: "2026-10-16T08:10:00.000Z",
        payload: {
          kind: "dose" as const,
          drug: "propofol" as const,
          amount: 50,
          unit: "mg" as const,
        },
      };

      const entry2 = {
        clientId: "22222222-2222-4222-8222-222222222222",
        recordedAt: "2026-10-16T08:15:00.000Z",
        payload: {
          kind: "vitals" as const,
          vitals: {
            context: "intra" as const,
            hr: 76,
            sbp: 120,
            dbp: 80,
            spo2: 98,
            rr: 14,
            etco2: 38,
          },
        },
      };

      // First batch sync
      const res1 = await built.app.inject({
        method: "POST",
        url: "/cases/case-batch-sync/aims/batch",
        headers: {
          ...bearer(tokenAnes),
          "x-facility-id": facilityId,
        },
        payload: {
          entries: [entry1, entry2],
        },
      });

      expect(res1.statusCode).toBe(200);
      const result1 = res1.json<{ syncedCount: number; duplicateCount: number }>();
      expect(result1.syncedCount).toBe(2);
      expect(result1.duplicateCount).toBe(0);

      // Second batch sync: replay entry1 and entry2 + 1 new entry3
      const entry3 = {
        clientId: "33333333-3333-4333-8333-333333333333",
        recordedAt: "2026-10-16T08:20:00.000Z",
        payload: {
          kind: "airway_event" as const,
          type: "chin_lift" as const,
          note: "Chin lift performed",
        },
      };

      const res2 = await built.app.inject({
        method: "POST",
        url: "/cases/case-batch-sync/aims/batch",
        headers: {
          ...bearer(tokenAnes),
          "x-facility-id": facilityId,
        },
        payload: {
          entries: [entry1, entry2, entry3],
        },
      });

      expect(res2.statusCode).toBe(200);
      const result2 = res2.json<{ syncedCount: number; duplicateCount: number }>();
      expect(result2.syncedCount).toBe(1);
      expect(result2.duplicateCount).toBe(2);
    });
  });
});
