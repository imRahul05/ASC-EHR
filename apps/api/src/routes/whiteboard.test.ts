import { forFacility } from "@asc/api-client/server";
import { facilityGrant, staffPrincipal } from "@asc/authz/testing";
import { caseStageExtension } from "@asc/fhir";
import type { WhiteboardBoard, WhiteboardCard } from "@asc/types";
import { afterEach, describe, expect, it } from "vitest";

import { buildTestApp } from "../testing/test-app.js";
import { CasesMockClient as MockClient } from "../testing/mock-medplum.js";
import { computeRoomStatuses } from "./whiteboard.js";

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
      const json = response.json<WhiteboardBoard>();
      expect(json.cards.length).toBe(1);
      expect(json.cards[0]?.caseId).toBe("appt-today");
      expect(json.cards[0]?.initials).toBe("A.C.");
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
        period: { start: today, end: new Date(Date.now() + 45 * 60_000).toISOString() },
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
      const json = response.json<WhiteboardBoard>();
      expect(json.cards.length).toBe(1);
      const card = json.cards[0];
      expect(card?.caseId).toBe("enc-pacu");
      expect(card?.phase).toBe("RECOVERY");
      expect(card?.initials).toBe("B.M.");

      const room2 = json.rooms.find((r) => r.id === "room-2");
      expect(room2?.status).toBe("turnover");
      expect(room2?.currentCaseId).toBe("enc-pacu");
      const room1 = json.rooms.find((r) => r.id === "room-1");
      expect(room1?.status).toBe("idle");
    });

    it("dynamically reflects room status as in_use when a procedure is actively occupying the suite and extracts flags", async () => {
      const mockMedplum = new MockClient();
      const facilityId = "fac-a";
      const today = new Date().toISOString();

      await forFacility(mockMedplum, facilityId).create({
        resourceType: "Appointment",
        id: "appt-active-or",
        status: "booked",
        start: today,
        end: new Date(Date.now() + 45 * 60_000).toISOString(),
        participant: [
          { actor: { reference: "Location/room-1" }, status: "accepted" },
          { actor: { reference: "Patient/pat-procedure", display: "Alice Smith" }, status: "accepted" },
        ],
      });

      await forFacility(mockMedplum, facilityId).create({
        resourceType: "Encounter",
        id: "enc-procedure",
        status: "in-progress",
        period: { start: today, end: new Date(Date.now() + 45 * 60_000).toISOString() },
        class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB" },
        appointment: [{ reference: "Appointment/appt-active-or" }],
        extension: [
          caseStageExtension("procedure_start"),
          { url: "http://asc.local/fhir/StructureDefinition/case-flag", valueCode: "allergy" },
          { url: "http://asc.local/fhir/StructureDefinition/case-flag", valueCode: "anticoagulant" },
        ],
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
        url: "/whiteboard?mode=clinical",
        headers: bearer("token-clinician"),
      });

      expect(response.statusCode).toBe(200);
      const json = response.json<WhiteboardBoard>();
      expect(json.cards.length).toBe(1);
      const card = json.cards[0];
      expect(card?.phase).toBe("IN_PROCEDURE");
      expect(card?.flags).toEqual(["allergy", "anticoagulant"]);

      const room1 = json.rooms.find((r) => r.id === "room-1");
      expect(room1?.status).toBe("in_use");
      expect(room1?.currentCaseId).toBe("enc-procedure");
    });

    it("formats and preserves canonical case numbers with CASE- prefix", async () => {
      const mockMedplum = new MockClient();
      const facilityId = "fac-a";
      const today = new Date().toISOString();

      await forFacility(mockMedplum, facilityId).create({
        resourceType: "Appointment",
        id: "appt-canon-num",
        status: "booked",
        start: today,
        end: new Date(Date.now() + 30 * 60_000).toISOString(),
        participant: [
          { actor: { reference: "Location/room-3" }, status: "accepted" },
          { actor: { reference: "Patient/pat-test-1", display: "Charlie Day" }, status: "accepted" },
        ],
      });

      await forFacility(mockMedplum, facilityId).create({
        resourceType: "Encounter",
        id: "enc-canon-num",
        status: "in-progress",
        period: { start: today, end: new Date(Date.now() + 30 * 60_000).toISOString() },
        class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB" },
        appointment: [{ reference: "Appointment/appt-canon-num" }],
        identifier: [
          { system: "https://fhir.wybit.io/asc/identifier/case-number", value: "CASE-2026-0042" },
        ],
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
        url: "/whiteboard?mode=tv",
        headers: bearer("token-clinician"),
      });

      expect(response.statusCode).toBe(200);
      const json = response.json<WhiteboardBoard>();
      expect(json.cards.length).toBe(1);
      expect(json.cards[0]?.caseNumber).toBe("CASE-2026-0042");
    });

    it("date-bounds encounter search and filters out encounters from other days or other facilities", async () => {
      const mockMedplum = new MockClient();
      const facilityId = "fac-a";
      const otherFacilityId = "fac-b";
      const today = new Date().toISOString();
      const yesterday = new Date(Date.now() - 36 * 3600_000).toISOString();

      // Today's appointment at fac-a
      await forFacility(mockMedplum, facilityId).create({
        resourceType: "Appointment",
        id: "appt-today-bound",
        status: "booked",
        start: today,
        end: new Date(Date.now() + 45 * 60_000).toISOString(),
        participant: [
          { actor: { reference: "Location/room-1" }, status: "accepted" },
          { actor: { reference: "Patient/pat-today-bound", display: "Today Bound" }, status: "accepted" },
        ],
      });

      // Today's encounter at fac-a (should match and map)
      await forFacility(mockMedplum, facilityId).create({
        resourceType: "Encounter",
        id: "enc-today-bound",
        status: "in-progress",
        period: { start: today, end: new Date(Date.now() + 45 * 60_000).toISOString() },
        class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB" },
        appointment: [{ reference: "Appointment/appt-today-bound" }],
        extension: [caseStageExtension("in_room")],
      });

      // Yesterday's encounter at fac-a (should be excluded by date bounds)
      await forFacility(mockMedplum, facilityId).create({
        resourceType: "Encounter",
        id: "enc-yesterday-bound",
        status: "finished",
        period: { start: yesterday, end: new Date(Date.parse(yesterday) + 45 * 60_000).toISOString() },
        class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB" },
        appointment: [{ reference: "Appointment/appt-today-bound" }],
      });

      // Today's encounter at fac-b (should be excluded by facility account filter)
      await forFacility(mockMedplum, otherFacilityId).create({
        resourceType: "Encounter",
        id: "enc-other-fac",
        status: "in-progress",
        period: { start: today, end: new Date(Date.now() + 45 * 60_000).toISOString() },
        class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB" },
        appointment: [{ reference: "Appointment/appt-today-bound" }],
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
      const json = response.json<WhiteboardBoard>();
      expect(json.cards.length).toBe(1);
      const card = json.cards[0];
      // Mapped to today's encounter for fac-a
      expect(card?.caseId).toBe("enc-today-bound");
      expect(card?.phase).toBe("READY_FOR_PROCEDURE");
    });

    it("handles turnover timeout and does not get stuck in turnover when phaseEnteredAt is missing or expired", async () => {
      const mockMedplum = new MockClient();
      const facilityId = "fac-a";
      const now = Date.now();

      // Case 1: Room 1 entered recovery 5 minutes ago (within 15 min turnover window -> turnover)
      const fiveMinsAgo = new Date(now - 5 * 60_000).toISOString();
      await forFacility(mockMedplum, facilityId).create({
        resourceType: "Appointment",
        id: "appt-recent-recovery",
        status: "booked",
        start: fiveMinsAgo,
        end: new Date(now).toISOString(),
        participant: [
          { actor: { reference: "Location/room-1" }, status: "accepted" },
          { actor: { reference: "Patient/pat-1", display: "Pat One" }, status: "accepted" },
        ],
      });
      await forFacility(mockMedplum, facilityId).create({
        resourceType: "Encounter",
        id: "enc-recent-recovery",
        status: "in-progress",
        period: { start: fiveMinsAgo },
        class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB" },
        appointment: [{ reference: "Appointment/appt-recent-recovery" }],
        extension: [caseStageExtension("pacu")],
      });

      // Case 2: Room 2 entered recovery 25 minutes ago (window expired -> idle)
      const twentyFiveMinsAgo = new Date(now - 25 * 60_000).toISOString();
      await forFacility(mockMedplum, facilityId).create({
        resourceType: "Appointment",
        id: "appt-expired-recovery",
        status: "booked",
        start: twentyFiveMinsAgo,
        end: new Date(now - 5 * 60_000).toISOString(),
        participant: [
          { actor: { reference: "Location/room-2" }, status: "accepted" },
          { actor: { reference: "Patient/pat-2", display: "Pat Two" }, status: "accepted" },
        ],
      });
      await forFacility(mockMedplum, facilityId).create({
        resourceType: "Encounter",
        id: "enc-expired-recovery",
        status: "in-progress",
        period: { start: twentyFiveMinsAgo },
        class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB" },
        appointment: [{ reference: "Appointment/appt-expired-recovery" }],
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
      const json = response.json<WhiteboardBoard>();

      const room1 = json.rooms.find((r) => r.id === "room-1");
      expect(room1?.status).toBe("turnover");
      expect(room1?.currentCaseId).toBe("enc-recent-recovery");

      const room2 = json.rooms.find((r) => r.id === "room-2");
      expect(room2?.status).toBe("idle");
      expect(room2?.currentCaseId).toBeUndefined();
    });

    it("verifies computeRoomStatuses does not get stuck in turnover when phaseEnteredAt is undefined or invalid", () => {
      const now = Date.now();
      const fiveMinsAgo = new Date(now - 5 * 60_000).toISOString();
      const twentyMinsAgo = new Date(now - 20 * 60_000).toISOString();

      const testCards: WhiteboardCard[] = [
        {
          caseId: "case-active",
          caseNumber: "CASE-001",
          initials: "A.B.",
          phase: "IN_PROCEDURE",
          roomId: "room-1",
          procedureLabel: "Colonoscopy",
          scheduledStart: fiveMinsAgo,
          phaseEnteredAt: fiveMinsAgo,
          surgeonInitials: "DR",
          flags: [],
        },
        {
          caseId: "case-turnover",
          caseNumber: "CASE-002",
          initials: "C.D.",
          phase: "RECOVERY",
          roomId: "room-2",
          procedureLabel: "EGD",
          scheduledStart: fiveMinsAgo,
          phaseEnteredAt: fiveMinsAgo,
          surgeonInitials: "DR",
          flags: [],
        },
        {
          caseId: "case-expired",
          caseNumber: "CASE-003",
          initials: "E.F.",
          phase: "RECOVERY",
          roomId: "room-3",
          procedureLabel: "Colonoscopy",
          scheduledStart: twentyMinsAgo,
          phaseEnteredAt: twentyMinsAgo,
          surgeonInitials: "DR",
          flags: [],
        },
        {
          caseId: "case-no-timestamp",
          caseNumber: "CASE-004",
          initials: "G.H.",
          phase: "RECOVERY",
          roomId: "room-4",
          procedureLabel: "Colonoscopy",
          scheduledStart: fiveMinsAgo,
          phaseEnteredAt: undefined, // missing timestamp -> must NOT be stuck in turnover
          surgeonInitials: "DR",
          flags: [],
        },
      ];

      const rooms = computeRoomStatuses(testCards);

      const room1 = rooms.find((r) => r.id === "room-1");
      expect(room1?.status).toBe("in_use");
      expect(room1?.currentCaseId).toBe("case-active");

      const room2 = rooms.find((r) => r.id === "room-2");
      expect(room2?.status).toBe("turnover");
      expect(room2?.currentCaseId).toBe("case-turnover");

      const room3 = rooms.find((r) => r.id === "room-3");
      expect(room3?.status).toBe("idle");
      expect(room3?.currentCaseId).toBeUndefined();

      const room4 = rooms.find((r) => r.id === "room-4");
      expect(room4?.status).toBe("idle");
      expect(room4?.currentCaseId).toBeUndefined();
    });
  });
});

