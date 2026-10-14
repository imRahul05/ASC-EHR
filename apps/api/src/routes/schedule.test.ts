import { forFacility } from "@asc/api-client/server";
import { allGrant, facilityGrant, staffPrincipal } from "@asc/authz/testing";
import { caseStageExtension } from "@asc/fhir";
import type { ScheduleDay } from "@asc/types";
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

describe("Schedule routes", () => {
  describe("GET /schedule", () => {
    it("returns 401 when unauthenticated", async () => {
      built = await buildTestApp({ medplumBaseUrl: "http://localhost:8203/" });
      const response = await built.app.inject({
        method: "GET",
        url: "/schedule",
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns 403 when user lacks schedule.read capability", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["patient.read"])],
        "user-no-schedule",
      );
      built.identity.addToken("token-no-sched", principal);

      const response = await built.app.inject({
        method: "GET",
        url: "/schedule",
        headers: bearer("token-no-sched"),
        query: { facilityId: "fac-a" },
      });

      expect(response.statusCode).toBe(403);
    });

    it("returns 400 when facilityId is missing and cannot be resolved", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [allGrant(["admin"], ["schedule.read"])],
        "admin-no-facility",
      );
      built.identity.addToken("token-admin-no-fac", principal);

      const response = await built.app.inject({
        method: "GET",
        url: "/schedule",
        headers: bearer("token-admin-no-fac"),
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as { code: string };
      expect(body.code).toBe("facility_required");
    });

    it("returns 200 with date-bounded schedule, rooms, and cases", async () => {
      const mockMedplum = new MockClient();
      const testDate = "2026-10-14";
      const scheduledStart = `${testDate}T09:00:00.000Z`;
      const scheduledEnd = `${testDate}T09:45:00.000Z`;

      await forFacility(mockMedplum, "fac-a").create({
        resourceType: "Patient",
        id: "pat-100",
        name: [{ family: "Smith", given: ["John"] }],
        birthDate: "1985-05-15",
        gender: "male",
      });

      const appt = await forFacility(mockMedplum, "fac-a").create({
        resourceType: "Appointment",
        id: "appt-100",
        status: "booked",
        start: scheduledStart,
        end: scheduledEnd,
        description: "Screening Colonoscopy",
        participant: [
          { actor: { reference: "Location/room-1" }, status: "accepted" },
          { actor: { reference: "Patient/pat-100", display: "John Smith" }, status: "accepted" },
          { actor: { reference: "Practitioner/doc-1", display: "Dr. Alice Vance" }, status: "accepted" },
          { actor: { reference: "Practitioner/anes-1", display: "Dr. Elena Rostova" }, status: "accepted" },
        ],
      });

      await forFacility(mockMedplum, "fac-a").create({
        resourceType: "Encounter",
        id: "enc-100",
        status: "in-progress",
        class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB" },
        period: { start: scheduledStart, end: scheduledEnd },
        appointment: [{ reference: `Appointment/${appt.id}` }],
        subject: { reference: "Patient/pat-100" },
        serviceProvider: { reference: "Organization/fac-a" },
        extension: [caseStageExtension("in_room")],
      });

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["surgeon"], ["schedule.read"])],
        "surgeon-user",
      );
      built.identity.addToken("token-surgeon", principal);

      const response = await built.app.inject({
        method: "GET",
        url: "/schedule",
        headers: bearer("token-surgeon"),
        query: { facilityId: "fac-a", date: testDate },
      });

      expect(response.statusCode).toBe(200);
      const schedule = JSON.parse(response.body) as ScheduleDay;
      expect(schedule.date).toBe(testDate);
      expect(schedule.rooms.length).toBeGreaterThan(0);
      const room1 = schedule.rooms.find((r) => r.id === "room-1");
      expect(room1?.status).toBe("in_use");
      expect(room1?.currentCaseId).toBe("enc-100");

      expect(schedule.cases.length).toBe(1);
      const caseItem = schedule.cases[0];
      expect(caseItem?.id).toBe("enc-100");
      expect(caseItem?.patient.displayName).toBe("John Smith");
      expect(caseItem?.roomId).toBe("room-1");
      expect(caseItem?.scheduledStart).toBe(scheduledStart);
      expect(caseItem?.team.surgeon.name).toBe("Dr. Alice Vance");
      expect(caseItem?.stage).toBe("in_room");
    });

    it("defaults to today's date when date parameter is omitted", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["surgeon"], ["schedule.read"])],
        "surgeon-user-2",
      );
      built.identity.addToken("token-surgeon-2", principal);

      const response = await built.app.inject({
        method: "GET",
        url: "/schedule",
        headers: bearer("token-surgeon-2"),
        query: { facilityId: "fac-a" },
      });

      expect(response.statusCode).toBe(200);
      const schedule = JSON.parse(response.body) as ScheduleDay;
      expect(schedule.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(schedule.cases).toEqual([]);
      expect(schedule.rooms.every((r) => r.status === "idle")).toBe(true);
    });

    it("returns 400 when query contains an invalid date format", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["surgeon"], ["schedule.read"])],
        "surgeon-user-3",
      );
      built.identity.addToken("token-surgeon-3", principal);

      const response = await built.app.inject({
        method: "GET",
        url: "/schedule",
        headers: bearer("token-surgeon-3"),
        query: { facilityId: "fac-a", date: "invalid-date" },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as { code: string };
      expect(body.code).toBe("invalid_query");
    });
  });
});
