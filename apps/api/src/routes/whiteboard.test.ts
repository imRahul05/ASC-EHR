import { forFacility } from "@asc/api-client/server";
import { facilityGrant, staffPrincipal } from "@asc/authz/testing";
import { caseStageExtension } from "@asc/fhir";
import { afterEach, describe, expect, it } from "vitest";

import { buildTestApp } from "../testing/test-app.js";
import { CasesMockClient as MockClient } from "../testing/mock-medplum.js";

type Built = Awaited<ReturnType<typeof buildTestApp>>;
let built: Built | undefined;

afterEach(async () => {
  await built?.app.close();
  built = undefined;
});

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("Whiteboard routes", () => {
  describe("GET /whiteboard", () => {
    it("returns 401 when unauthenticated", async () => {
      built = await buildTestApp({ medplumBaseUrl: "http://localhost:8203/" });
      const response = await built.app.inject({
        method: "GET",
        url: "/whiteboard",
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns 403 when user lacks schedule.read capability", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      // User with patient.read only (no schedule.read)
      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["patient.read"])],
        "user-no-schedule",
      );
      built.identity.addToken("token-no-sched", principal);

      const response = await built.app.inject({
        method: "GET",
        url: "/whiteboard",
        headers: bearer("token-no-sched"),
      });

      expect(response.statusCode).toBe(403);
    });

    it("minimizes server response in TV mode (mode=tv)", async () => {
      const mockMedplum = new MockClient();
      const today = new Date().toISOString();

      await forFacility(mockMedplum, "fac-a").create({
        resourceType: "Patient",
        id: "pat-101",
        name: [{ family: "Doe", given: ["Jane"] }],
      });

      await forFacility(mockMedplum, "fac-a").create({
        resourceType: "Appointment",
        id: "appt-tv-test",
        status: "booked",
        start: today,
        end: new Date(Date.now() + 45 * 60_000).toISOString(),
        description: "Screening Colonoscopy with biopsy",
        participant: [
          { actor: { reference: "Location/room-1" }, status: "accepted" },
          { actor: { reference: "Patient/pat-101", display: "Jane Doe" }, status: "accepted" },
          { actor: { reference: "Practitioner/doc-dr-jones", display: "Dr. Indiana Jones" }, status: "accepted" },
        ],
      });

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["schedule.read"])],
        "user-sched",
      );
      built.identity.addToken("token-sched", principal);

      // 1. Clinical mode: returns procedure label, real initials, and clinician details
      const clinicalRes = await built.app.inject({
        method: "GET",
        url: "/whiteboard?mode=clinical",
        headers: bearer("token-sched"),
      });
      expect(clinicalRes.statusCode).toBe(200);
      const clinicalJson = clinicalRes.json();
      expect(clinicalJson.cards.length).toBeGreaterThan(0);
      const clinicalCard = clinicalJson.cards[0];
      expect(clinicalCard.procedureLabel).toBe("Screening Colonoscopy with biopsy");
      expect(clinicalCard.initials).toBe("J.D.");
      expect(clinicalCard.surgeonInitials).toBe("IJ");

      // 2. TV mode: server-side strips procedure label, flags, and surgeon initials
      const tvRes = await built.app.inject({
        method: "GET",
        url: "/whiteboard?mode=tv",
        headers: bearer("token-sched"),
      });
      expect(tvRes.statusCode).toBe(200);
      const tvJson = tvRes.json();
      expect(tvJson.cards.length).toBeGreaterThan(0);
      const tvCard = tvJson.cards[0];
      expect(tvCard.procedureLabel).toBe("");
      expect(tvCard.surgeonInitials).toBe("");
      expect(tvCard.flags).toEqual([]);
      // Initials and case number are preserved for kiosk identification
      expect(tvCard.initials).toBe("J.D.");
      expect(tvCard.caseNumber).toBeDefined();
    });

    it("filters out historical/future appointments outside today's date window", async () => {
      const mockMedplum = new MockClient();
      const facilityId = "fac-a";

      // Yesterday's appointment (-36 hours)
      const yesterdayIso = new Date(Date.now() - 36 * 3600_000).toISOString();
      await forFacility(mockMedplum, facilityId).create({
        resourceType: "Appointment",
        id: "appt-yesterday",
        status: "booked",
        start: yesterdayIso,
        end: new Date(Date.parse(yesterdayIso) + 45 * 60_000).toISOString(),
        participant: [
          { actor: { reference: "Location/room-1" }, status: "accepted" },
          { actor: { reference: "Patient/pat-old", display: "Old Case" }, status: "accepted" },
        ],
      });

      // Tomorrow's appointment (+36 hours)
      const tomorrowIso = new Date(Date.now() + 36 * 3600_000).toISOString();
      await forFacility(mockMedplum, facilityId).create({
        resourceType: "Appointment",
        id: "appt-tomorrow",
        status: "booked",
        start: tomorrowIso,
        end: new Date(Date.parse(tomorrowIso) + 45 * 60_000).toISOString(),
        participant: [
          { actor: { reference: "Location/room-1" }, status: "accepted" },
          { actor: { reference: "Patient/pat-future", display: "Future Case" }, status: "accepted" },
        ],
      });

      // Today's appointment
      const todayIso = new Date().toISOString();
      await forFacility(mockMedplum, facilityId).create({
        resourceType: "Appointment",
        id: "appt-today",
        status: "booked",
        start: todayIso,
        end: new Date(Date.parse(todayIso) + 45 * 60_000).toISOString(),
        participant: [
          { actor: { reference: "Location/room-1" }, status: "accepted" },
          { actor: { reference: "Patient/pat-active", display: "Active Case" }, status: "accepted" },
        ],
      });

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant(facilityId, ["front-desk"], ["schedule.read"])],
        "user-sched",
      );
      built.identity.addToken("token-sched", principal);

      const response = await built.app.inject({
        method: "GET",
        url: "/whiteboard",
        headers: bearer("token-sched"),
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.cards.length).toBe(1);
      expect(json.cards[0].caseId).toBe("appt-today");
      expect(json.cards[0].initials).toBe("A.C.");
    });

    it("maps dynamic clinical phase from linked Encounter extensions and status", async () => {
      const mockMedplum = new MockClient();
      const facilityId = "fac-a";
      const today = new Date().toISOString();

      await forFacility(mockMedplum, facilityId).create({
        resourceType: "Appointment",
        id: "appt-dynamic-phase",
        status: "booked",
        start: today,
        end: new Date(Date.now() + 45 * 60_000).toISOString(),
        participant: [
          { actor: { reference: "Location/room-2" }, status: "accepted" },
          { actor: { reference: "Patient/pat-recovery", display: "Bob Miller" }, status: "accepted" },
        ],
      });

      // Create linked Encounter with pacu / recovery stage extension
      await forFacility(mockMedplum, facilityId).create({
        resourceType: "Encounter",
        id: "enc-pacu",
        status: "in-progress",
        class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB" },
        appointment: [{ reference: "Appointment/appt-dynamic-phase" }],
        extension: [caseStageExtension("pacu")],
      });

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant(facilityId, ["clinical-staff"], ["schedule.read"])],
        "user-clinician",
      );
      built.identity.addToken("token-clinician", principal);

      const response = await built.app.inject({
        method: "GET",
        url: "/whiteboard",
        headers: bearer("token-clinician"),
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.cards.length).toBe(1);
      const card = json.cards[0];
      expect(card.caseId).toBe("enc-pacu");
      expect(card.phase).toBe("RECOVERY");
      expect(card.initials).toBe("B.M.");
    });
  });
});
