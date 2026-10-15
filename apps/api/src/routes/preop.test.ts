import { forFacility } from "@asc/api-client/server";
import { facilityGrant, staffPrincipal } from "@asc/authz/testing";
import { caseReadinessExtensions, caseStageExtension } from "@asc/fhir";
import type { CaseDetail } from "@asc/types";
import type { Encounter, Observation, Patient } from "@medplum/fhirtypes";
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

describe("Pre-Op Assessment routes", () => {
  const facilityId = "fac-preop-1";
  const userPreop = "user-preop";
  const tokenPreop = "token-preop";
  const userNoPreop = "user-no-preop";
  const tokenNoPreop = "token-no-preop";

  async function setupApp(mockMedplum: MockClient): Promise<Built> {
    const appBuilt = await buildTestApp({
      medplumBaseUrl: "http://localhost:8203/",
      createMedplumClient: () => mockMedplum,
    });
    appBuilt.identity.addToken(
      tokenPreop,
      staffPrincipal(
        [facilityGrant(facilityId, ["preop-nurse"], ["case.read", "procedure.document", "case.advance"])],
        userPreop,
      ),
    );
    appBuilt.identity.addToken(
      tokenNoPreop,
      staffPrincipal(
        [facilityGrant(facilityId, ["front-desk"], ["patient.read"])],
        userNoPreop,
      ),
    );
    return appBuilt;
  }

  async function seedCase(mockMedplum: MockClient, caseId: string) {
    const facilityClient = forFacility(mockMedplum, facilityId);

    const patient: Patient = await facilityClient.create({
      resourceType: "Patient",
      id: `pat-${caseId}`,
      name: [{ family: "Johnson", given: ["Robert"] }],
      birthDate: "1975-08-20",
      gender: "male",
    });

    const encounter: Encounter = await facilityClient.create({
      resourceType: "Encounter",
      id: caseId,
      status: "arrived",
      class: { code: "AMB" },
      subject: { reference: `Patient/${patient.id}` },
      extension: [
        caseStageExtension("arrived"),
        ...caseReadinessExtensions([
          { name: "identity", status: "satisfied", label: "Identity verification" },
          { name: "hp", status: "satisfied", label: "History & physical" },
          { name: "prep", status: "pending", label: "Bowel preparation" },
          { name: "escort", status: "pending", label: "Responsible escort" },
        ]),
      ],
    });

    return { patient, encounter };
  }

  const validPreopPayload = {
    caseId: "case-preop-ok",
    facilityId,
    vitals: {
      sbp: 124,
      dbp: 78,
      hr: 72,
      rr: 16,
      spo2: 99,
      tempC: 36.8,
      heightInches: 70,
      weightLbs: 175,
    },
    iv: {
      site: "left_forearm" as const,
      gauge: 20 as const,
      attempts: 1,
    },
    npo: {
      solidFoodHoursAgo: 8,
      clearLiquidsHoursAgo: 3,
      confirmed: true,
    },
    escort: {
      name: "Mary Johnson",
      phone: "(555) 234-5678",
      relationship: "Spouse",
      confirmedPresent: true,
    },
    allergiesReviewed: true as const,
    belongingsSecured: true,
  };

  describe("POST /cases/:caseId/preop-assessment", () => {
    it("returns 401 when unauthenticated", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-1/preop-assessment",
        payload: validPreopPayload,
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 when lacking procedure.document capability", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-1/preop-assessment",
        headers: { ...bearer(tokenNoPreop), "x-facility-id": facilityId },
        payload: validPreopPayload,
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 404 when case does not exist", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-nonexistent/preop-assessment",
        headers: { ...bearer(tokenPreop), "x-facility-id": facilityId },
        payload: { ...validPreopPayload, caseId: "case-nonexistent" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ code: "not_found" });
    });

    it("returns 400 when vitals are out of physiological bounds", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-bad-vitals");
      built = await setupApp(mockMedplum);

      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-bad-vitals/preop-assessment",
        headers: { ...bearer(tokenPreop), "x-facility-id": facilityId },
        payload: {
          ...validPreopPayload,
          caseId: "case-bad-vitals",
          vitals: {
            ...validPreopPayload.vitals,
            sbp: 40, // Below min 50
          },
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/Invalid pre-op assessment payload/i);
    });

    it("evaluates prep readiness check to failed on NPO solid food violation (< 6 hours)", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-npo-violation");
      built = await setupApp(mockMedplum);

      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-npo-violation/preop-assessment",
        headers: { ...bearer(tokenPreop), "x-facility-id": facilityId },
        payload: {
          ...validPreopPayload,
          caseId: "case-npo-violation",
          npo: {
            solidFoodHoursAgo: 4, // Violation: < 6 hours
            clearLiquidsHoursAgo: 3,
            confirmed: true,
          },
        },
      });

      expect(res.statusCode).toBe(200);

      // Verify case detail shows prep check as failed
      const detailRes = await built.app.inject({
        method: "GET",
        url: "/cases/case-npo-violation",
        headers: { ...bearer(tokenPreop), "x-facility-id": facilityId },
      });
      const detail = detailRes.json<CaseDetail>();
      const checks = detail.case.readinessChecks ?? [];
      const prepCheck = checks.find((c) => c.name === "prep");
      expect(prepCheck?.status).toBe("failed");
      expect(prepCheck?.details).toMatch(/NPO/i);
    });

    it("evaluates prep readiness check to failed on NPO clear liquids violation (< 2 hours)", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-liquid-violation");
      built = await setupApp(mockMedplum);

      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-liquid-violation/preop-assessment",
        headers: { ...bearer(tokenPreop), "x-facility-id": facilityId },
        payload: {
          ...validPreopPayload,
          caseId: "case-liquid-violation",
          npo: {
            solidFoodHoursAgo: 10,
            clearLiquidsHoursAgo: 1, // Violation: < 2 hours
            confirmed: true,
          },
        },
      });

      expect(res.statusCode).toBe(200);

      const detailRes = await built.app.inject({
        method: "GET",
        url: "/cases/case-liquid-violation",
        headers: { ...bearer(tokenPreop), "x-facility-id": facilityId },
      });
      const detail = detailRes.json<CaseDetail>();
      const checks = detail.case.readinessChecks ?? [];
      const prepCheck = checks.find((c) => c.name === "prep");
      expect(prepCheck?.status).toBe("failed");
    });

    it("successfully submits pre-op assessment, records LOINC observations, and updates readiness", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-preop-ok");
      built = await setupApp(mockMedplum);

      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-preop-ok/preop-assessment",
        headers: { ...bearer(tokenPreop), "x-facility-id": facilityId },
        payload: validPreopPayload,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ ok: boolean; vitals: { sbp: number; dbp: number; hr: number } }>();
      expect(body.ok).toBe(true);
      expect(body.vitals).toBeDefined();
      expect(body.vitals.sbp).toBe(124);
      expect(body.vitals.dbp).toBe(78);
      expect(body.vitals.hr).toBe(72);

      // Verify case detail has updated readiness checks and flags
      const detailRes = await built.app.inject({
        method: "GET",
        url: "/cases/case-preop-ok",
        headers: { ...bearer(tokenPreop), "x-facility-id": facilityId },
      });
      const detail = detailRes.json<CaseDetail>();
      const checks = detail.case.readinessChecks ?? [];
      const prepCheck = checks.find((c) => c.name === "prep");
      expect(prepCheck?.status).toBe("satisfied");

      const escortCheck = checks.find((c) => c.name === "escort");
      expect(escortCheck?.status).toBe("satisfied");

      // Verify readiness flags
      expect(detail.case.readiness.escortConfirmed).toBe(true);
      expect(detail.case.readiness.ivPlaced).toBe(true);

      // Verify observations were stored in Medplum
      const observations = await mockMedplum.searchResources("Observation", [
        ["encounter", "Encounter/case-preop-ok"],
      ]);
      expect(observations.length).toBeGreaterThanOrEqual(6);
      const sbpObs = observations.find((o: Observation) => o.code?.coding?.[0]?.code === "8480-6");
      expect(sbpObs?.valueQuantity?.value).toBe(124);
    });
  });
});
