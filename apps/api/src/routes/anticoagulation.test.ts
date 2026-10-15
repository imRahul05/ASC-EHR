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

describe("Anticoagulation Assessment routes", () => {
  const facilityId = "fac-anticoag-1";
  const userStaff = "user-staff";
  const tokenStaff = "token-staff";
  const userFrontDesk = "user-front-desk";
  const tokenFrontDesk = "token-front-desk";

  async function setupApp(mockMedplum: MockClient): Promise<Built> {
    const appBuilt = await buildTestApp({
      medplumBaseUrl: "http://localhost:8203/",
      createMedplumClient: () => mockMedplum,
    });
    appBuilt.identity.addToken(
      tokenStaff,
      staffPrincipal(
        [facilityGrant(facilityId, ["rn"], ["case.read", "procedure.document", "case.advance"])],
        userStaff,
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
    anticoagStatus: "satisfied" | "pending" | "failed" = "pending",
  ) {
    const facilityClient = forFacility(mockMedplum, facilityId);

    const patient: Patient = await facilityClient.create({
      resourceType: "Patient",
      id: `pat-${caseId}`,
      name: [{ family: "Davis", given: ["Michael"] }],
      birthDate: "1965-11-20",
      gender: "male",
    });

    const encounter: Encounter = await facilityClient.create({
      resourceType: "Encounter",
      id: caseId,
      status: "in-progress",
      class: { code: "AMB" },
      subject: { reference: `Patient/${patient.id}` },
      period: { start: "2026-10-15T09:00:00.000Z" },
      extension: [
        caseStageExtension("preop"),
        ...caseReadinessExtensions([
          { name: "identity", status: "satisfied", label: "Identity verification" },
          { name: "consent", status: "satisfied", label: "Informed consent" },
          { name: "hp", status: "satisfied", label: "History & physical" },
          { name: "anesthesia_clearance", status: "satisfied", label: "Anesthesia clearance" },
          { name: "equipment", status: "satisfied", label: "Equipment ready" },
          { name: "escort", status: "satisfied", label: "Responsible escort" },
          {
            name: "anticoagulation",
            status: anticoagStatus,
            label: "Anticoagulation hold",
          },
        ]),
      ],
    });

    return { patient, encounter };
  }

  describe("POST /cases/:caseId/anticoagulation", () => {
    it("returns 401 when unauthenticated", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-1/anticoagulation",
        payload: {
          caseId: "case-1",
          facilityId,
          hasAnticoagulants: false,
          procedureBleedingRisk: "low",
          medications: [],
        },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 when lacking procedure.document capability", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-1/anticoagulation",
        headers: { ...bearer(tokenFrontDesk), "x-facility-id": facilityId },
        payload: {
          caseId: "case-1",
          facilityId,
          hasAnticoagulants: false,
          procedureBleedingRisk: "low",
          medications: [],
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 404 when case does not exist", async () => {
      const mockMedplum = new MockClient();
      built = await setupApp(mockMedplum);
      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-nonexistent/anticoagulation",
        headers: { ...bearer(tokenStaff), "x-facility-id": facilityId },
        payload: {
          caseId: "case-nonexistent",
          facilityId,
          hasAnticoagulants: false,
          procedureBleedingRisk: "low",
          medications: [],
        },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ code: "not_found" });
    });

    it("sets anticoagulation check to satisfied when patient takes no anticoagulants", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-no-anticoag", "pending");
      built = await setupApp(mockMedplum);

      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-no-anticoag/anticoagulation",
        headers: { ...bearer(tokenStaff), "x-facility-id": facilityId },
        payload: {
          caseId: "case-no-anticoag",
          facilityId,
          hasAnticoagulants: false,
          procedureBleedingRisk: "high",
          medications: [],
          assessorName: "Sarah Connor, RN",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.readinessChecks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "anticoagulation",
            status: "satisfied",
          }),
        ]),
      );

      // Verify Gate 2 transition to in_room now succeeds
      const transitionRes = await built.app.inject({
        method: "POST",
        url: "/cases/case-no-anticoag/transition",
        headers: { ...bearer(tokenStaff), "x-facility-id": facilityId },
        payload: { to: "in_room" },
      });
      expect(transitionRes.statusCode).toBe(200);
      expect(transitionRes.json().case.stage).toBe("in_room");
    });

    it("leaves check as pending and blocks Gate 2 when prescriber instruction date is missing for DOAC", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-missing-instr", "pending");
      built = await setupApp(mockMedplum);

      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-missing-instr/anticoagulation",
        headers: { ...bearer(tokenStaff), "x-facility-id": facilityId },
        payload: {
          caseId: "case-missing-instr",
          facilityId,
          hasAnticoagulants: true,
          procedureBleedingRisk: "high",
          medications: [
            {
              medicationId: "med-eliquis",
              medicationName: "Eliquis (apixaban) 5mg BID",
              drugClass: "doac",
              patientConfirmedHeld: true,
              lastDoseTakenAt: "2026-10-13T08:00:00.000Z",
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.readinessChecks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "anticoagulation",
            status: "pending",
          }),
        ]),
      );

      // Verify Gate 2 transition is blocked
      const transitionRes = await built.app.inject({
        method: "POST",
        url: "/cases/case-missing-instr/transition",
        headers: { ...bearer(tokenStaff), "x-facility-id": facilityId },
        payload: { to: "in_room" },
      });
      expect(transitionRes.statusCode).toBe(409);
      expect(transitionRes.json().code).toBe("GATE_FAILED");
      expect(transitionRes.json().reasons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "GATE2_ANTICOAGULATION",
          }),
        ]),
      );
    });

    it("satisfies check and creates Observation when prescriber instruction and day-of hold are confirmed", async () => {
      const mockMedplum = new MockClient();
      await seedCase(mockMedplum, "case-hold-ok", "pending");
      built = await setupApp(mockMedplum);

      const res = await built.app.inject({
        method: "POST",
        url: "/cases/case-hold-ok/anticoagulation",
        headers: { ...bearer(tokenStaff), "x-facility-id": facilityId },
        payload: {
          caseId: "case-hold-ok",
          facilityId,
          hasAnticoagulants: true,
          procedureBleedingRisk: "high",
          medications: [
            {
              medicationId: "med-eliquis",
              medicationName: "Eliquis (apixaban) 5mg BID",
              drugClass: "doac",
              prescriberInstructionDate: "2026-10-10",
              prescriberInstruction: "Hold 48h prior to colonoscopy",
              prescriberName: "Dr. Cardiologist",
              patientConfirmedHeld: true,
              lastDoseTakenAt: "2026-10-13T07:00:00.000Z",
            },
          ],
          assessorName: "Sarah Connor, RN",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.readinessChecks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "anticoagulation",
            status: "satisfied",
          }),
        ]),
      );

      // Verify Observation was created in Medplum
      const observations = await mockMedplum.searchResources("Observation", [
        ["encounter", `Encounter/case-hold-ok`],
      ]);
      expect(observations.length).toBeGreaterThan(0);
      const obs = observations[0]!;
      expect(obs.code?.coding?.[0]?.code).toBe("80585-3");

      // Verify Gate 2 transition succeeds
      const transitionRes = await built.app.inject({
        method: "POST",
        url: "/cases/case-hold-ok/transition",
        headers: { ...bearer(tokenStaff), "x-facility-id": facilityId },
        payload: { to: "in_room" },
      });
      expect(transitionRes.statusCode).toBe(200);
      expect(transitionRes.json().case.stage).toBe("in_room");
    });
  });
});
