import { forFacility } from "@asc/api-client/server";
import { facilityGrant, staffPrincipal } from "@asc/authz/testing";
import { caseReadinessExtensions, caseStageExtension, LOINC_CODES } from "@asc/fhir";
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

const VALID_CHECKLIST = {
  patientIdentity: true,
  procedureConfirmed: true,
  consentVerified: true,
  allergiesReviewed: true,
  equipmentReady: true,
  anticoagulationReviewed: true,
};

const VALID_PARTICIPANTS = [
  { userId: "rn-1", name: "Nurse Jane", role: "circulating_rn" as const },
  { userId: "dr-1", name: "Dr. Smith", role: "endoscopist" as const },
];

describe("Procedure Capture & Gate 2 routes (Phase P18)", () => {
  const facilityId = "fac-intraop-1";
  const tokenClinician = "token-clinician";
  const tokenPhysician = "token-physician";
  const tokenReadOnly = "token-readonly";

  async function setupApp(mockMedplum: MockClient): Promise<Built> {
    const appBuilt = await buildTestApp({ medplumBaseUrl: "http://localhost:8203/", createMedplumClient: () => mockMedplum });
    appBuilt.identity.addToken(
      tokenClinician,
      staffPrincipal([facilityGrant(facilityId, ["rn"], ["case.read", "timeout.participate", "procedure.document", "case.advance"])], "user-rn"),
    );
    appBuilt.identity.addToken(
      tokenPhysician,
      staffPrincipal([facilityGrant(facilityId, ["gi-physician"], ["case.read", "timeout.participate", "procedure.document", "case.advance"])], "user-dr"),
    );
    appBuilt.identity.addToken(tokenReadOnly, staffPrincipal([facilityGrant(facilityId, ["front-desk"], ["patient.read"])], "user-ro"));
    return appBuilt;
  }

  async function seedCase(mockMedplum: MockClient, caseId: string) {
    const facilityClient = forFacility(mockMedplum, facilityId);
    const patient = await facilityClient.create({ resourceType: "Patient", id: `pat-${caseId}`, name: [{ family: "Smith", given: ["Jane"] }] });
    const encounter = await facilityClient.create({
      resourceType: "Encounter",
      id: caseId,
      status: "in-progress",
      class: { code: "AMB" },
      subject: { reference: `Patient/${patient.id}` },
      extension: [caseStageExtension("in_room"), ...caseReadinessExtensions([{ name: "identity", status: "satisfied", label: "Identity" }])],
    });
    const serviceRequest = await facilityClient.create({
      resourceType: "ServiceRequest",
      id: `sr-${caseId}`,
      status: "active",
      intent: "order",
      subject: { reference: `Patient/${patient.id}` },
      encounter: { reference: `Encounter/${encounter.id}` },
      code: { coding: [{ system: "http://www.ama-assn.org/go/cpt", code: "45378", display: "Colonoscopy" }] },
    });
    return { patient, encounter, serviceRequest };
  }

  describe("POST /cases/:caseId/time-out", () => {
    it("returns 401 when unauthenticated", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-to-1");
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({ method: "POST", url: "/cases/case-to-1/time-out", payload: { checklist: VALID_CHECKLIST } });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 when lacking timeout.participate capability", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-to-2");
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({ method: "POST", url: "/cases/case-to-2/time-out", headers: bearer(tokenReadOnly), payload: { checklist: VALID_CHECKLIST } });
      expect(res.statusCode).toBe(403);
    });

    it("returns 409 when checklist verification is incomplete", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-to-3");
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-to-3/time-out",
        headers: bearer(tokenClinician),
        payload: { checklist: { ...VALID_CHECKLIST, procedureConfirmed: false }, participants: VALID_PARTICIPANTS },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("GATE_FAILED");
    });

    it("returns 200 and records timeout when multi-role verification succeeds", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-to-4");
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-to-4/time-out",
        headers: bearer(tokenClinician),
        payload: { checklist: VALID_CHECKLIST, participants: VALID_PARTICIPANTS },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.case.readiness.timeOutComplete).toBe(true);
      expect(data.timeOut.participants).toHaveLength(2);
    });
  });

  describe("POST /cases/:caseId/scope", () => {
    it("returns 409 when leak test or cycle fails", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-sc-1");
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-sc-1/scope",
        headers: bearer(tokenClinician),
        payload: { scopeSerial: "OLY-CF-999", reprocessedAt: new Date(Date.now() - 3600_000).toISOString(), leakTestResult: "FAIL", cycleOutcome: "PASS" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("GATE_FAILED");
    });

    it("returns 409 when hang time exceeds 168 hours", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-sc-2");
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-sc-2/scope",
        headers: bearer(tokenClinician),
        payload: { scopeSerial: "OLY-CF-888", reprocessedAt: new Date(Date.now() - 170 * 3600_000).toISOString(), leakTestResult: "PASS", cycleOutcome: "PASS" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().message).toContain("168-hour");
    });

    it("returns 200 when scope verification succeeds", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-sc-3");
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-sc-3/scope",
        headers: bearer(tokenClinician),
        payload: { scopeSerial: "OLY-CF-12345", scopeModel: "CF-HQ190L", reprocessedAt: new Date(Date.now() - 24 * 3600_000).toISOString(), leakTestResult: "PASS", cycleOutcome: "PASS" },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.scopeAssignment?.scopeSerial).toBe("OLY-CF-12345");
      expect(data.scopeAssignment?.withinHangTimeWindow).toBe(true);
    });
  });

  describe("POST /cases/:caseId/events", () => {
    it("rejects SCOPE_IN before timeout completion", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-ev-1");
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({ method: "POST", url: "/cases/case-ev-1/events", headers: bearer(tokenClinician), payload: { type: "SCOPE_IN" } });
      expect(res.statusCode).toBe(409);
      expect(res.json().message).toContain("timeout must be completed");
    });

    it("records events and auto-computes withdrawal time on SCOPE_OUT", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-ev-2");
      built = await setupApp(mockMedplum);

      await built.app.inject({ method: "POST", url: "/cases/case-ev-2/time-out", headers: bearer(tokenClinician), payload: { checklist: VALID_CHECKLIST, participants: VALID_PARTICIPANTS } });
      await built.app.inject({ method: "POST", url: "/cases/case-ev-2/scope", headers: bearer(tokenClinician), payload: { scopeSerial: "OLY-CF-555", reprocessedAt: new Date(Date.now() - 10 * 3600_000).toISOString(), leakTestResult: "PASS", cycleOutcome: "PASS" } });

      const resIn = await built.app.inject({ method: "POST", url: "/cases/case-ev-2/events", headers: bearer(tokenClinician), payload: { type: "SCOPE_IN", at: "2026-10-16T10:00:00.000Z" } });
      expect(resIn.statusCode).toBe(200);

      const resCecum = await built.app.inject({ method: "POST", url: "/cases/case-ev-2/events", headers: bearer(tokenClinician), payload: { type: "CECUM_REACHED", at: "2026-10-16T10:10:00.000Z" } });
      expect(resCecum.statusCode).toBe(200);

      const resOut = await built.app.inject({ method: "POST", url: "/cases/case-ev-2/events", headers: bearer(tokenClinician), payload: { type: "SCOPE_OUT", at: "2026-10-16T10:17:00.000Z" } });
      expect(resOut.statusCode).toBe(200);

      const allObs = await mockMedplum.searchResources<"Observation">("Observation", [["encounter", "Encounter/case-ev-2"]]);
      const wtObs = allObs.filter((o) => o.code?.coding?.[0]?.code === LOINC_CODES.WITHDRAWAL_TIME);
      expect(wtObs).toHaveLength(1);
      expect(wtObs[0]?.valueQuantity?.value).toBe(7);
    });
  });

  describe("POST /cases/:caseId/gate2-override", () => {
    it("returns 403 when non-physician/non-anesthesia role attempts override", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-ov-1");
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({ method: "POST", url: "/cases/case-ov-1/gate2-override", headers: bearer(tokenClinician), payload: { reason: "Emergency clinical necessity confirmed by team", actorName: "Nurse Jane" } });
      expect(res.statusCode).toBe(403);
    });

    it("returns 200 when attending physician submits clinical override", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-ov-2");
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({ method: "POST", url: "/cases/case-ov-2/gate2-override", headers: bearer(tokenPhysician), payload: { reason: "Patient cleared by attending GI physician despite marginal prep score", actorName: "Dr. Smith, MD" } });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.gate2Override?.reason).toContain("marginal prep score");
    });
  });
});
