import { forFacility } from "@asc/api-client/server";
import { facilityGrant, staffPrincipal } from "@asc/authz/testing";
import { caseReadinessExtensions, caseStageExtension } from "@asc/fhir";
import type { ReadinessCheck } from "@asc/types";
import type { Encounter, Patient, ServiceRequest } from "@medplum/fhirtypes";
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

describe("Case Workspace and Transition routes", () => {
  const facilityId = "fac-cases-1";
  const userRead = "user-read";
  const tokenRead = "token-read";
  const userAdvance = "user-advance";
  const tokenAdvance = "token-advance";
  const userNone = "user-none";
  const tokenNone = "token-none";

  async function setupApp(mockMedplum: MockClient): Promise<Built> {
    const appBuilt = await buildTestApp({
      medplumBaseUrl: "http://localhost:8203/",
      createMedplumClient: () => mockMedplum,
    });
    appBuilt.identity.addToken(tokenRead, staffPrincipal([facilityGrant(facilityId, ["surgeon"], ["case.read"])], userRead));
    appBuilt.identity.addToken(tokenAdvance, staffPrincipal([facilityGrant(facilityId, ["circulating-nurse"], ["case.read", "case.advance"])], userAdvance));
    appBuilt.identity.addToken(tokenNone, staffPrincipal([facilityGrant(facilityId, ["front-desk"], ["patient.read"])], userNone));
    return appBuilt;
  }

  describe("GET /cases/:caseId", () => {
    it("returns 401 when unauthenticated", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({ method: "GET", url: "/cases/case-123" });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 when lacking case.read capability", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "GET",
        url: "/cases/case-123",
        headers: { ...bearer(tokenNone), "x-facility-id": facilityId },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 404 when case does not exist", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "GET",
        url: "/cases/case-nonexistent",
        headers: { ...bearer(tokenRead), "x-facility-id": facilityId },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ code: "not_found" });
    });

    it("returns 200 with hydrated CaseDetail", async () => {
      const mockMedplum = new MockClient();
      const facilityClient = forFacility(mockMedplum, facilityId);

      const patient: Patient = await facilityClient.create({
        resourceType: "Patient",
        id: "pat-detail-1",
        name: [{ family: "Smith", given: ["Alice"] }],
        birthDate: "1985-04-12",
        gender: "female",
      });

      const encounter: Encounter = await facilityClient.create({
        resourceType: "Encounter",
        id: "case-detail-1",
        status: "planned",
        class: { code: "AMB" },
        subject: { reference: `Patient/${patient.id}` },
        period: { start: "2026-10-14T09:00:00.000Z", end: "2026-10-14T10:00:00.000Z" },
        extension: [caseStageExtension("requested")],
      });

      const sr: ServiceRequest = await facilityClient.create({
        resourceType: "ServiceRequest",
        status: "active",
        intent: "order",
        subject: { reference: `Patient/${patient.id}` },
        encounter: { reference: `Encounter/${encounter.id}` },
        code: { coding: [{ code: "45378", display: "Colonoscopy" }] },
      });

      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "GET",
        url: `/cases/${encounter.id}`,
        headers: { ...bearer(tokenRead), "x-facility-id": facilityId },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.case.id).toBe(encounter.id);
      expect(data.case.patient.displayName).toBe("Alice Smith");
      expect(data.patient.id).toBe(patient.id);
      expect(data.patient.firstName).toBe("Alice");
      expect(data.summary).toBeDefined();
      expect(data.timeOut).toBeDefined();
      expect(data.anesthesia).toBeDefined();
      expect(sr.id).toBeDefined();
    });
  });

  describe("POST /cases/:caseId/transition", () => {
    it("returns 401 when unauthenticated", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({ method: "POST", url: "/cases/case-123/transition", payload: { to: "preop" } });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 when lacking case.advance capability", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-123/transition",
        headers: { ...bearer(tokenRead), "x-facility-id": facilityId },
        payload: { to: "preop" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 400 when body is invalid", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-123/transition",
        headers: { ...bearer(tokenAdvance), "x-facility-id": facilityId },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: "invalid_payload" });
    });

    it("returns 404 when case does not exist", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-nonexistent/transition",
        headers: { ...bearer(tokenAdvance), "x-facility-id": facilityId },
        payload: { to: "preop" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 409 GATE_FAILED when Gate 1 checks are unsatisfied", async () => {
      const mockMedplum = new MockClient();
      const facilityClient = forFacility(mockMedplum, facilityId);

      const patient: Patient = await facilityClient.create({
        resourceType: "Patient",
        id: "pat-trans-fail",
        name: [{ family: "Johnson", given: ["Bob"] }],
        birthDate: "1970-01-01",
      });

      const encounter: Encounter = await facilityClient.create({
        resourceType: "Encounter",
        id: "case-gate1-fail",
        status: "arrived",
        class: { code: "AMB" },
        subject: { reference: `Patient/${patient.id}` },
        period: { start: "2026-10-14T09:00:00.000Z" },
        extension: [caseStageExtension("arrived")],
      });

      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: `/cases/${encounter.id}/transition`,
        headers: { ...bearer(tokenAdvance), "x-facility-id": facilityId },
        payload: { to: "preop" },
      });

      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.code).toBe("GATE_FAILED");
      expect(Array.isArray(body.reasons)).toBe(true);
      expect(body.reasons.length).toBeGreaterThan(0);
    });

    it("returns 200 and transitions stage when gate checks are satisfied", async () => {
      const mockMedplum = new MockClient();
      const facilityClient = forFacility(mockMedplum, facilityId);

      const patient: Patient = await facilityClient.create({
        resourceType: "Patient",
        id: "pat-trans-ok",
        name: [{ family: "Williams", given: ["Carol"] }],
        birthDate: "1982-08-20",
      });

      const satisfiedChecks: ReadinessCheck[] = [
        { name: "identity", label: "Patient identity", status: "satisfied" },
        { name: "consent", label: "Informed consent", status: "satisfied" },
        { name: "hp", label: "History & physical", status: "satisfied" },
      ];

      const encounter: Encounter = await facilityClient.create({
        resourceType: "Encounter",
        id: "case-gate1-ok",
        status: "arrived",
        class: { code: "AMB" },
        subject: { reference: `Patient/${patient.id}` },
        period: { start: "2026-10-14T09:00:00.000Z" },
        extension: [
          caseStageExtension("arrived"),
          ...caseReadinessExtensions(satisfiedChecks),
        ],
      });

      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: `/cases/${encounter.id}/transition`,
        headers: { ...bearer(tokenAdvance), "x-facility-id": facilityId },
        payload: { to: "preop" },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.case.id).toBe(encounter.id);
      expect(data.case.stage).toBe("preop");
      expect(data.case.phase).toBe("PRE_OP");

      const reloaded: Encounter = await mockMedplum.readResource("Encounter", "case-gate1-ok");
      expect(reloaded.status).toBe("in-progress");
    });
  });
});
