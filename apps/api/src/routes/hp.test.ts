import { forFacility } from "@asc/api-client/server";
import { facilityGrant, staffPrincipal } from "@asc/authz/testing";
import { caseReadinessExtensions, caseStageExtension } from "@asc/fhir";
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

describe("H&P and Day-of Update routes", () => {
  const facilityId = "fac-hp-1";
  const userPhysician = "user-physician";
  const tokenPhysician = "token-physician";
  const userMedDirector = "user-med-director";
  const tokenMedDirector = "token-med-director";
  const userNurse = "user-nurse";
  const tokenNurse = "token-nurse";
  const userFrontDesk = "user-front-desk";
  const tokenFrontDesk = "token-front-desk";

  async function setupApp(mockMedplum: MockClient): Promise<Built> {
    const appBuilt = await buildTestApp({
      medplumBaseUrl: "http://localhost:8203/",
      createMedplumClient: () => mockMedplum,
    });
    appBuilt.identity.addToken(
      tokenPhysician,
      staffPrincipal(
        [facilityGrant(facilityId, ["attending-physician"], ["case.read", "procedure.document", "case.advance"])],
        userPhysician,
      ),
    );
    appBuilt.identity.addToken(
      tokenMedDirector,
      staffPrincipal(
        [facilityGrant(facilityId, ["medical-director"], ["case.read", "procedure.document", "case.advance"])],
        userMedDirector,
      ),
    );
    appBuilt.identity.addToken(
      tokenNurse,
      staffPrincipal(
        [facilityGrant(facilityId, ["preop-nurse"], ["case.read", "procedure.document", "case.advance"])],
        userNurse,
      ),
    );
    appBuilt.identity.addToken(
      tokenFrontDesk,
      staffPrincipal(
        [facilityGrant(facilityId, ["front-desk"], ["patient.read"])],
        userFrontDesk,
      ),
    );
    return appBuilt;
  }

  async function seedCase(
    mockMedplum: MockClient,
    caseId: string,
    hpStatus: "satisfied" | "pending" | "failed" | "waived" = "pending",
  ) {
    const facilityClient = forFacility(mockMedplum, facilityId);

    const patient: Patient = await facilityClient.create({
      resourceType: "Patient",
      id: `pat-${caseId}`,
      name: [{ family: "Smith", given: ["Jane"] }],
      birthDate: "1978-03-15",
      gender: "female",
    });

    const encounter: Encounter = await facilityClient.create({
      resourceType: "Encounter",
      id: caseId,
      status: "arrived",
      class: { code: "AMB" },
      subject: { reference: `Patient/${patient.id}` },
      period: { start: "2026-10-15T09:00:00.000Z" },
      extension: [
        caseStageExtension("arrived"),
        ...caseReadinessExtensions([
          { name: "identity", status: "satisfied", label: "Identity verification" },
          { name: "consent", status: "satisfied", label: "Informed consent" },
          {
            name: "hp",
            status: hpStatus,
            label: "History & physical",
            details: hpStatus === "failed" ? "H&P exceeds 30-day limit" : undefined,
          },
        ]),
      ],
    });

    return { patient, encounter };
  }

  describe("POST /cases/:caseId/hp-update", () => {
    it("returns 401 when unauthenticated", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-1/hp-update",
        payload: {
          caseId: "case-1",
          facilityId,
          attestation: "I confirm no interval change in cardiopulmonary status.",
          noIntervalChange: true,
          cardiovascularStatus: "Regular rate and rhythm",
          pulmonaryStatus: "Clear to auscultation bilaterally",
        },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 when lacking procedure.document capability", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-1/hp-update",
        headers: { ...bearer(tokenFrontDesk), "x-facility-id": facilityId },
        payload: {
          caseId: "case-1",
          facilityId,
          attestation: "I confirm no interval change in cardiopulmonary status.",
          noIntervalChange: true,
          cardiovascularStatus: "Regular rate and rhythm",
          pulmonaryStatus: "Clear to auscultation bilaterally",
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 404 when case does not exist", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-nonexistent/hp-update",
        headers: { ...bearer(tokenPhysician), "x-facility-id": facilityId },
        payload: {
          caseId: "case-nonexistent",
          facilityId,
          attestation: "I confirm no interval change in cardiopulmonary status.",
          noIntervalChange: true,
          cardiovascularStatus: "Regular rate and rhythm",
          pulmonaryStatus: "Clear to auscultation bilaterally",
        },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ code: "not_found" });
    });

    it("returns 400 when attestation is too short (< 10 chars)", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-short-attest");
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-short-attest/hp-update",
        headers: { ...bearer(tokenPhysician), "x-facility-id": facilityId },
        payload: {
          caseId: "case-short-attest",
          facilityId,
          attestation: "No change",
          noIntervalChange: true,
          cardiovascularStatus: "Normal",
          pulmonaryStatus: "Clear",
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("invalid_payload");
    });

    it("successfully creates DocumentReference and transitions hp check to satisfied, unblocking Gate 1", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-hp-ok", "pending");
      built = await setupApp(mockMedplum);

      // Verify Gate 1 transition initially fails because H&P is pending
      const initialTransition = await built.app.inject({
        method: "POST",
        url: "/cases/case-hp-ok/transition",
        headers: { ...bearer(tokenPhysician), "x-facility-id": facilityId },
        payload: { to: "preop" },
      });
      expect(initialTransition.statusCode).toBe(409);
      expect(initialTransition.json().code).toBe("GATE_FAILED");

      // Submit day-of H&P update note
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-hp-ok/hp-update",
        headers: { ...bearer(tokenPhysician), "x-facility-id": facilityId },
        payload: {
          caseId: "case-hp-ok",
          facilityId,
          attestation: "Evaluated patient today; no interval change in cardiopulmonary or airway status.",
          noIntervalChange: true,
          cardiovascularStatus: "Regular rhythm, no murmurs",
          pulmonaryStatus: "Lungs clear bilaterally, no wheezes",
          airwayStatus: "Mallampati II, normal neck mobility",
          practitionerName: "Dr. Gregory House",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.readinessChecks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "hp",
            status: "satisfied",
          }),
        ]),
      );

      // Verify Gate 1 transition now succeeds
      const unblockedTransition = await built.app.inject({
        method: "POST",
        url: "/cases/case-hp-ok/transition",
        headers: { ...bearer(tokenPhysician), "x-facility-id": facilityId },
        payload: { to: "preop" },
      });
      expect(unblockedTransition.statusCode).toBe(200);
      expect(unblockedTransition.json().case.stage).toBe("preop");
    });
  });

  describe("POST /cases/:caseId/hp-override", () => {
    it("returns 403 when non-physician staff attempts to override H&P", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-override-denied", "failed");
      built = await setupApp(mockMedplum);

      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-override-denied/hp-override",
        headers: { ...bearer(tokenNurse), "x-facility-id": facilityId },
        payload: {
          caseId: "case-override-denied",
          facilityId,
          overrideReason: "Surgeon requested patient advance anyway.",
          role: "attending-physician",
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("forbidden");
      expect(res.json().message).toMatch(/attending physician or medical director/i);
    });

    it("allows attending physician to override Gate 1 H&P check with clinical justification", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-override-ok", "failed");
      built = await setupApp(mockMedplum);

      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-override-ok/hp-override",
        headers: { ...bearer(tokenPhysician), "x-facility-id": facilityId },
        payload: {
          caseId: "case-override-ok",
          facilityId,
          overrideReason: "Diagnostic screening EGD; full in-person assessment completed this morning.",
          role: "attending-physician",
          practitionerName: "Dr. Lisa Cuddy",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.readinessChecks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "hp",
            status: "waived",
            waivedRole: "attending-physician",
          }),
        ]),
      );

      // Verify Gate 1 transition now succeeds with waived H&P
      const unblockedTransition = await built.app.inject({
        method: "POST",
        url: "/cases/case-override-ok/transition",
        headers: { ...bearer(tokenPhysician), "x-facility-id": facilityId },
        payload: { to: "preop" },
      });
      expect(unblockedTransition.statusCode).toBe(200);
      expect(unblockedTransition.json().case.stage).toBe("preop");
    });

    it("allows medical director to override Gate 1 H&P check", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-override-dir", "failed");
      built = await setupApp(mockMedplum);

      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-override-dir/hp-override",
        headers: { ...bearer(tokenMedDirector), "x-facility-id": facilityId },
        payload: {
          caseId: "case-override-dir",
          facilityId,
          overrideReason: "Medical director emergency clinical clearance approved.",
          role: "medical-director",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);
    });
  });

  describe("GET /cases/:caseId/hp", () => {
    it("returns 404 when case does not exist", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "GET",
        url: "/cases/case-nonexistent/hp",
        headers: { ...bearer(tokenPhysician), "x-facility-id": facilityId },
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns H&P details when case exists", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-hp-get", "satisfied");
      built = await setupApp(mockMedplum);

      const res = await built.app.inject({
        method: "GET",
        url: "/cases/case-hp-get/hp",
        headers: { ...bearer(tokenPhysician), "x-facility-id": facilityId },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.caseId).toBe("case-hp-get");
      expect(body.status).toBe("satisfied");
    });
  });
});
