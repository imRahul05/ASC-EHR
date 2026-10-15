import { forFacility } from "@asc/api-client/server";
import { facilityGrant, staffPrincipal } from "@asc/authz/testing";
import { caseReadinessExtensions, caseStageExtension } from "@asc/fhir";
import { evaluateGate1 } from "@asc/clinical-rules/gates";
import type { CaseDetail } from "@asc/types";
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

const VALID_PNG_SIGNATURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAABaCAYAAAA7W3NRAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAGVSURBVHhe7dsxEcAwDMCwhz95r0mBh7cUM4oAC3C815z37e9z1uW1r1r7er/z2d/nrMsr3wI=";

const TRANSPARENT_1X1_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("Consent routes", () => {
  const facilityId = "fac-consent-1";
  const userConsent = "user-consent";
  const tokenConsent = "token-consent";
  const userNoConsent = "user-no-consent";
  const tokenNoConsent = "token-no-consent";

  async function setupApp(mockMedplum: MockClient): Promise<Built> {
    const appBuilt = await buildTestApp({
      medplumBaseUrl: "http://localhost:8203/",
      createMedplumClient: () => mockMedplum,
    });
    appBuilt.identity.addToken(
      tokenConsent,
      staffPrincipal(
        [facilityGrant(facilityId, ["rn"], ["case.read", "consent.collect", "procedure.document", "case.advance"])],
        userConsent,
      ),
    );
    appBuilt.identity.addToken(
      tokenNoConsent,
      staffPrincipal(
        [facilityGrant(facilityId, ["front-desk"], ["patient.read"])],
        userNoConsent,
      ),
    );
    return appBuilt;
  }

  async function seedCase(mockMedplum: MockClient, caseId: string, procedureCode = "45385") {
    const facilityClient = forFacility(mockMedplum, facilityId);

    const patient: Patient = await facilityClient.create({
      resourceType: "Patient",
      id: `pat-${caseId}`,
      name: [{ family: "Smith", given: ["Alice"] }],
      birthDate: "1985-04-12",
      gender: "female",
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
          { name: "consent", status: "pending", label: "Informed consent" },
        ]),
      ],
    });

    const serviceRequest: ServiceRequest = await facilityClient.create({
      resourceType: "ServiceRequest",
      id: `sr-${caseId}`,
      status: "active",
      intent: "order",
      subject: { reference: `Patient/${patient.id}` },
      encounter: { reference: `Encounter/${encounter.id}` },
      code: {
        coding: [{ system: "http://www.ama-assn.org/go/cpt", code: procedureCode, display: "Colonoscopy with Polypectomy" }],
      },
    });

    return { patient, encounter, serviceRequest };
  }

  describe("POST /cases/:caseId/consent", () => {
    it("returns 401 when unauthenticated", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-1/consent",
        payload: {
          caseId: "case-1",
          facilityId,
          procedureName: "Colonoscopy with Polypectomy",
          procedureCode: "45385",
          performingPhysicianName: "Dr. Jane Corwin",
          signerName: "Alice Smith",
          signerRelationship: "patient",
          signatureDataUrl: VALID_PNG_SIGNATURE,
          consentFormVersion: "v1.0",
          risksAcknowledged: true,
        },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 when lacking consent.collect capability", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-1/consent",
        headers: { ...bearer(tokenNoConsent), "x-facility-id": facilityId },
        payload: {
          caseId: "case-1",
          facilityId,
          procedureName: "Colonoscopy with Polypectomy",
          procedureCode: "45385",
          performingPhysicianName: "Dr. Jane Corwin",
          signerName: "Alice Smith",
          signerRelationship: "patient",
          signatureDataUrl: VALID_PNG_SIGNATURE,
          consentFormVersion: "v1.0",
          risksAcknowledged: true,
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 404 when case does not exist", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-nonexistent/consent",
        headers: { ...bearer(tokenConsent), "x-facility-id": facilityId },
        payload: {
          caseId: "case-nonexistent",
          facilityId,
          procedureName: "Colonoscopy with Polypectomy",
          procedureCode: "45385",
          performingPhysicianName: "Dr. Jane Corwin",
          signerName: "Alice Smith",
          signerRelationship: "patient",
          signatureDataUrl: VALID_PNG_SIGNATURE,
          consentFormVersion: "v1.0",
          risksAcknowledged: true,
        },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ code: "not_found" });
    });

    it("returns 400 when signatureDataUrl is empty or transparent", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-bad-sig");
      built = await setupApp(mockMedplum);

      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-bad-sig/consent",
        headers: { ...bearer(tokenConsent), "x-facility-id": facilityId },
        payload: {
          caseId: "case-bad-sig",
          facilityId,
          procedureName: "Colonoscopy with Polypectomy",
          procedureCode: "45385",
          performingPhysicianName: "Dr. Jane Corwin",
          signerName: "Alice Smith",
          signerRelationship: "patient",
          signatureDataUrl: TRANSPARENT_1X1_PNG,
          consentFormVersion: "v1.0",
          risksAcknowledged: true,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/Invalid consent payload/i);
    });

    it("successfully signs consent and transitions consent check to satisfied", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-sign-ok", "45385");
      built = await setupApp(mockMedplum);

      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-sign-ok/consent",
        headers: { ...bearer(tokenConsent), "x-facility-id": facilityId },
        payload: {
          caseId: "case-sign-ok",
          facilityId,
          procedureName: "Colonoscopy with Polypectomy",
          procedureCode: "45385",
          performingPhysicianName: "Dr. Jane Corwin",
          signerName: "Alice Smith",
          signerRelationship: "patient",
          signatureDataUrl: VALID_PNG_SIGNATURE,
          consentFormVersion: "v1.0",
          risksAcknowledged: true,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.consent).toBeDefined();
      expect(body.consent.status).toBe("signed");
      expect(body.consent.signerName).toBe("Alice Smith");

      // Verify case detail was updated
      const detailRes = await built.app.inject({
        method: "GET",
        url: "/cases/case-sign-ok",
        headers: { ...bearer(tokenConsent), "x-facility-id": facilityId },
      });
      const detail = detailRes.json<CaseDetail>();
      const checks = detail.case.readinessChecks ?? [];
      const consentCheck = checks.find((c) => c.name === "consent");
      expect(consentCheck?.status).toBe("satisfied");

      // Verify Hard Gate 1 passes
      const gate1 = evaluateGate1(checks);
      expect(gate1.ok).toBe(true);
    });

    it("evaluates consent readiness check to failed when procedure code mismatches (AC-E-09-2)", async () => {
      const mockMedplum = new MockClient();
      // Scheduled as Colonoscopy (45385)
      await seedCase(mockMedplum, "case-mismatch", "45385");
      built = await setupApp(mockMedplum);

      // Sign for EGD (43239)
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-mismatch/consent",
        headers: { ...bearer(tokenConsent), "x-facility-id": facilityId },
        payload: {
          caseId: "case-mismatch",
          facilityId,
          procedureName: "Esophagogastroduodenoscopy (EGD)",
          procedureCode: "43239",
          performingPhysicianName: "Dr. Jane Corwin",
          signerName: "Alice Smith",
          signerRelationship: "patient",
          signatureDataUrl: VALID_PNG_SIGNATURE,
          consentFormVersion: "v1.0",
          risksAcknowledged: true,
        },
      });

      expect(res.statusCode).toBe(200);

      // Check detail reflects consent as failed due to mismatch
      const detailRes = await built.app.inject({
        method: "GET",
        url: "/cases/case-mismatch",
        headers: { ...bearer(tokenConsent), "x-facility-id": facilityId },
      });
      const detail = detailRes.json<CaseDetail>();
      const checks = detail.case.readinessChecks ?? [];
      const consentCheck = checks.find((c) => c.name === "consent");
      expect(consentCheck?.status).toBe("failed");
      expect(consentCheck?.details).toMatch(/mismatch/i);

      // Gate 1 must fail
      const gate1 = evaluateGate1(checks);
      expect(gate1.ok).toBe(false);
      const gateReason = gate1.reasons.find((r) => r.code === "GATE1_CONSENT");
      expect(gateReason).toBeDefined();
    });
  });

  describe("GET /cases/:caseId/consent", () => {
    it("returns null when no consent has been signed", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-no-consent-yet");
      built = await setupApp(mockMedplum);

      const res = await built.app.inject({
        method: "GET",
        url: "/cases/case-no-consent-yet/consent",
        headers: { ...bearer(tokenConsent), "x-facility-id": facilityId },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toBeNull();
    });

    it("returns signed consent after submission", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-get-consent", "45385");
      built = await setupApp(mockMedplum);

      await built.app.inject({
        method: "POST",
        url: "/cases/case-get-consent/consent",
        headers: { ...bearer(tokenConsent), "x-facility-id": facilityId },
        payload: {
          caseId: "case-get-consent",
          facilityId,
          procedureName: "Colonoscopy with Polypectomy",
          procedureCode: "45385",
          performingPhysicianName: "Dr. Jane Corwin",
          signerName: "Alice Smith",
          signerRelationship: "patient",
          signatureDataUrl: VALID_PNG_SIGNATURE,
          consentFormVersion: "v1.0",
          risksAcknowledged: true,
        },
      });

      const res = await built.app.inject({
        method: "GET",
        url: "/cases/case-get-consent/consent",
        headers: { ...bearer(tokenConsent), "x-facility-id": facilityId },
      });

      expect(res.statusCode).toBe(200);
      const consent = res.json();
      expect(consent).not.toBeNull();
      expect(consent.caseId).toBe("case-get-consent");
      expect(consent.signerName).toBe("Alice Smith");
      expect(consent.status).toBe("signed");
    });
  });
});
