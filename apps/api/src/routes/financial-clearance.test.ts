/**
 * Financial Clearance Fastify 5 Endpoints Test Suite
 *
 * Verifies real-time eligibility verification (270/271), financial summary with dual GFE,
 * front-desk copay/deductible collection, and prior authorization (278) revalidation.
 *
 * US Healthcare Regulations:
 * - HIPAA ANSI ASC X12 270/271: Standards for eligibility inquiry and response.
 * - HIPAA ANSI ASC X12 278: Standards for prior authorization and health care services review.
 * - ACA 42 U.S.C. § 300gg-13: Preventive service cost-sharing mandates.
 * - No Surprises Act 45 CFR § 149: Requirements for good-faith estimates and cost transparency.
 */

import { forFacility } from "@asc/api-client/server";
import { facilityGrant, staffPrincipal } from "@asc/authz/testing";
import { caseReadinessExtensions, caseStageExtension } from "@asc/fhir";
import type { Coverage, Encounter, Patient, ServiceRequest } from "@medplum/fhirtypes";
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

describe("Financial clearance routes in Fastify API", () => {
  const facilityId = "fac-fin-1";
  const userStaff = "user-desk";
  const tokenStaff = "token-desk";
  const userNoPerm = "user-no-perm";
  const tokenNoPerm = "token-no-perm";

  async function setupApp(mockMedplum: MockClient): Promise<Built> {
    const appBuilt = await buildTestApp({
      medplumBaseUrl: "http://localhost:8203/",
      createMedplumClient: () => mockMedplum,
    });
    appBuilt.identity.addToken(
      tokenStaff,
      staffPrincipal(
        [
          facilityGrant(
            facilityId,
            ["front-desk"],
            ["patient.eligibility.check", "case.read", "patient.register", "schedule.read"]
          ),
        ],
        userStaff
      )
    );
    appBuilt.identity.addToken(
      tokenNoPerm,
      staffPrincipal([facilityGrant(facilityId, ["scheduler"], ["schedule.read"])], userNoPerm)
    );
    return appBuilt;
  }

  async function seedTestEncounter(
    mockMedplum: MockClient,
    options?: {
      encounterId?: string;
      cptCode?: string;
      serviceTypeCode?: string;
      memberId?: string;
      scheduledDate?: string;
    }
  ): Promise<{ patientId: string; coverageId: string; encounterId: string; serviceRequestId: string }> {
    const client = forFacility(mockMedplum, facilityId);
    const encounterId = options?.encounterId ?? "case-fin-101";
    const patientId = `patient-${encounterId}`;
    const coverageId = `coverage-${encounterId}`;
    const serviceRequestId = `sr-${encounterId}`;
    const scheduledDate = options?.scheduledDate ?? "2026-10-20";

    const patient = await client.create<Patient>({
      resourceType: "Patient",
      id: patientId,
      name: [{ family: "Smith", given: ["John"] }],
      birthDate: "1980-05-15",
      gender: "male",
    });

    await client.create<Coverage>({
      resourceType: "Coverage",
      id: coverageId,
      status: "active",
      beneficiary: { reference: `Patient/${patient.id}` },
      payor: [{ reference: `Organization/${facilityId}`, display: "Aetna Choice POS II" }],
      subscriberId: options?.memberId ?? "W12345678",
      relationship: {
        coding: [{ system: "http://terminology.hl7.org/CodeSystem/subscriber-relationship", code: "self" }],
      },
    });

    await client.create<ServiceRequest>({
      resourceType: "ServiceRequest",
      id: serviceRequestId,
      status: "active",
      intent: "order",
      subject: { reference: `Patient/${patient.id}` },
      code: {
        coding: [
          {
            system: "http://www.ama-assn.org/go/cpt",
            code: options?.cptCode ?? "45378",
            display: "Colonoscopy, flexible; diagnostic",
          },
        ],
      },
    });

    await client.create<Encounter>({
      resourceType: "Encounter",
      id: encounterId,
      status: "planned",
      class: { code: "AMB", system: "http://terminology.hl7.org/CodeSystem/v3-ActCode" },
      subject: { reference: `Patient/${patient.id}` },
      period: { start: `${scheduledDate}T08:00:00Z`, end: `${scheduledDate}T09:00:00Z` },
      extension: [
        caseStageExtension("scheduled"),
        ...caseReadinessExtensions([
          { name: "identity", status: "satisfied", label: "Identity verified" },
          { name: "coverage", status: "pending", label: "Active eligibility" },
          { name: "benefits", status: "pending", label: "Benefits capture" },
          { name: "authorization", status: "pending", label: "Prior authorization" },
          { name: "estimate", status: "pending", label: "Good faith estimate" },
        ]),
      ],
    });

    return { patientId: patient.id, coverageId, encounterId, serviceRequestId };
  }

  describe("POST /cases/:caseId/eligibility/check", () => {
    it("returns 401 when unauthenticated", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-fin-101/eligibility/check",
        headers: { "x-facility-id": facilityId },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 when lacking patient.eligibility.check capability", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-fin-101/eligibility/check",
        headers: { ...bearer(tokenNoPerm), "x-facility-id": facilityId },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 200 and updates case readiness to satisfied when eligible", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const seed = await seedTestEncounter(mockMedplum);

      const res = await built.app.inject({
        method: "POST",
        url: `/cases/${seed.encounterId}/eligibility/check`,
        headers: { ...bearer(tokenStaff), "x-facility-id": facilityId },
        payload: { forceRefresh: true, serviceTypeCode: "33" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.eligibility.status).toBe("active");
      expect(body.evaluation.status).toBe("satisfied");
      expect(body.evaluation.requiresWorkItem).toBe(false);

      // Verify encounter readiness checks updated in Medplum
      const updatedEncounter = await mockMedplum.readResource("Encounter", seed.encounterId);
      expect(updatedEncounter.extension).toBeDefined();
    });

    it("evaluates degraded response as pending when missing endoscopy service type (Review Focus #1)", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const seed = await seedTestEncounter(mockMedplum, {
        encounterId: "case-degraded-271",
        memberId: "INCOMPLETE_271", // Mock adapter returns incomplete for this id
      });

      const res = await built.app.inject({
        method: "POST",
        url: `/cases/${seed.encounterId}/eligibility/check`,
        headers: { ...bearer(tokenStaff), "x-facility-id": facilityId },
        payload: { forceRefresh: true },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.eligibility.status).toBe("incomplete");
      expect(body.evaluation.status).toBe("pending");
      expect(body.evaluation.requiresWorkItem).toBe(true);
    });
  });

  describe("GET /cases/:caseId/financial-summary", () => {
    it("returns financial summary with dual GFE estimate for screening colonoscopy", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const seed = await seedTestEncounter(mockMedplum, { cptCode: "45378" });

      // Run eligibility first to seed benefits
      await built.app.inject({
        method: "POST",
        url: `/cases/${seed.encounterId}/eligibility/check`,
        headers: { ...bearer(tokenStaff), "x-facility-id": facilityId },
        payload: { forceRefresh: true },
      });

      const res = await built.app.inject({
        method: "GET",
        url: `/cases/${seed.encounterId}/financial-summary`,
        headers: { ...bearer(tokenStaff), "x-facility-id": facilityId },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.eligibilityStatus).toBe("active");
      expect(body.estimate).toBeDefined();
      expect(body.estimate.estimatedScreeningPatientOwedCents).toBe(0); // $0 under ACA 42 U.S.C. § 300gg-13
      expect(body.estimate.estimatedTherapeuticPatientOwedCents).toBeGreaterThan(0); // Deductible/coinsurance applies
    });
  });

  describe("POST /cases/:caseId/copay-collected", () => {
    it("posts payment and returns receipt details", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const seed = await seedTestEncounter(mockMedplum);

      const res = await built.app.inject({
        method: "POST",
        url: `/cases/${seed.encounterId}/copay-collected`,
        headers: { ...bearer(tokenStaff), "x-facility-id": facilityId },
        payload: {
          amountCents: 5000,
          paymentMethod: "credit_card",
          transactionRef: "tx_123456",
          notes: "Collected at front desk",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.paidCents).toBe(5000);
      expect(body.paymentMethod).toBe("credit_card");
    });
  });

  describe("POST /cases/:caseId/prior-auth", () => {
    it("fails prior auth when procedure date exceeds authorization validTo date (Review Focus #2)", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const seed = await seedTestEncounter(mockMedplum, {
        encounterId: "case-rescheduled",
        scheduledDate: "2026-11-15", // Moved to Nov 15
      });

      const res = await built.app.inject({
        method: "POST",
        url: `/cases/${seed.encounterId}/prior-auth`,
        headers: { ...bearer(tokenStaff), "x-facility-id": facilityId },
        payload: {
          authNumber: "AUTH-88219",
          status: "approved",
          validFrom: "2026-10-01",
          validTo: "2026-10-31", // Expired on Oct 31!
          approvedCptCodes: ["45378"],
          approvedUnits: 1,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.evaluation.status).toBe("failed");
      expect(body.evaluation.isExpired).toBe(true);
      expect(body.evaluation.reason).toContain("outside authorization window");
    });
  });
});
