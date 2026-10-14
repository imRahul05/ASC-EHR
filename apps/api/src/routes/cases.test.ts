import { forFacility } from "@asc/api-client/server";
import { facilityGrant, staffPrincipal } from "@asc/authz/testing";
import { bookingIdempotencyIdentifier } from "@asc/fhir";
import type { Appointment } from "@medplum/fhirtypes";
import { afterEach, describe, expect, it } from "vitest";

import { buildTestApp } from "../testing/test-app.js";
import { CasesMockClient as MockClient } from "../testing/mock-medplum.js";
import { classifyMedplumReadError } from "./cases.js";

type Built = Awaited<ReturnType<typeof buildTestApp>>;
let built: Built | undefined;

afterEach(async () => {
  await built?.app.close();
  built = undefined;
});

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

const futureInstant = (offsetHours = 24) =>
  new Date(Date.now() + offsetHours * 3600 * 1000).toISOString();

const seedPatient = (
  medplum: MockClient,
  facilityId: string,
  patientId: string,
  familyName = "Doe",
  givenName = "Jane",
) =>
  forFacility(medplum, facilityId).create({
    resourceType: "Patient",
    id: patientId,
    name: [{ family: familyName, given: [givenName] }],
    birthDate: "1980-01-01",
  });

describe("Cases routes", () => {
  describe("POST /cases", () => {
    it("returns 401 when unauthenticated", async () => {
      built = await buildTestApp({ medplumBaseUrl: "http://localhost:8203/" });
      const response = await built.app.inject({
        method: "POST",
        url: "/cases",
        payload: {
          facilityId: "fac-a",
          patientId: "pat-1",
          roomId: "room-1",
          scheduledAt: futureInstant(),
          durationMinutes: 45,
          primaryPhysicianId: "doc-1",
          procedureIntent: "screening",
          primaryProcedureCode: "45378",
        },
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns 403 when caller lacks schedule.manage capability at the facility", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      // User has case.read but NOT schedule.manage
      const principal = staffPrincipal([facilityGrant("fac-a", ["rn"], ["case.read"])], "user-no-sched");
      built.identity.addToken("token-no-sched", principal);

      const response = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: bearer("token-no-sched"),
        payload: {
          facilityId: "fac-a",
          patientId: "pat-1",
          roomId: "room-1",
          scheduledAt: futureInstant(),
          durationMinutes: 45,
          primaryPhysicianId: "doc-1",
          procedureIntent: "screening",
          primaryProcedureCode: "45378",
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it("returns 400 when facilityId cannot be resolved", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])],
        "fd-no-fac",
      );
      built.identity.addToken("token-fd-no-fac", principal);

      const response = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: bearer("token-fd-no-fac"),
        payload: {
          // Missing facilityId
          patientId: "pat-1",
          roomId: "room-1",
          scheduledAt: futureInstant(),
          durationMinutes: 45,
          primaryPhysicianId: "doc-1",
          procedureIntent: "screening",
          primaryProcedureCode: "45378",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "invalid_payload" });
    });

    it("returns 400 when scheduledAt is in the past", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])], "fd-past");
      built.identity.addToken("token-past", principal);

      const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
      const response = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: bearer("token-past"),
        payload: {
          facilityId: "fac-a",
          patientId: "pat-1",
          roomId: "room-1",
          scheduledAt: pastDate,
          durationMinutes: 45,
          primaryPhysicianId: "doc-1",
          procedureIntent: "screening",
          primaryProcedureCode: "45378",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "invalid_payload" });
    });

    it("books a case successfully and returns 201 with case and encounter IDs", async () => {
      const mockMedplum = new MockClient();

      // Seed patient
      await forFacility(mockMedplum, "fac-a").create({
        resourceType: "Patient",
        id: "pat-101",
        name: [{ family: "Smith", given: ["Alice"] }],
        birthDate: "1985-05-15",
      });

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])], "fd-success");
      built.identity.addToken("token-fd-success", principal);

      const scheduledAt = futureInstant(48);
      const response = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: bearer("token-fd-success"),
        payload: {
          facilityId: "fac-a",
          patientId: "pat-101",
          roomId: "room-1",
          scheduledAt,
          durationMinutes: 45,
          primaryPhysicianId: "doc-dr-jones",
          anesthesiologistId: "crna-brown",
          procedureIntent: "screening",
          primaryProcedureCode: "45378",
          secondaryProcedureCodes: ["45380"],
          notes: "Screening colonoscopy with sedation.",
        },
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.caseId).toBeDefined();
      expect(json.encounterId).toBeDefined();
      expect(json.appointmentId).toBeDefined();
      expect(json.scheduledAt).toBe(scheduledAt);
      expect(json.roomId).toBe("room-1");
    });

    it("returns 409 conflict when room is already double-booked during the time window", async () => {
      const mockMedplum = new MockClient();

      const scheduledAt = futureInstant(72);
      const startMs = Date.parse(scheduledAt);
      const endMs = startMs + 45 * 60 * 1000;

      await seedPatient(mockMedplum, "fac-a", "pat-new");

      // Seed existing booked appointment in room-1
      await forFacility(mockMedplum, "fac-a").create({
        resourceType: "Appointment",
        status: "booked",
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
        participant: [
          { actor: { reference: "Patient/pat-existing" }, status: "accepted" },
          { actor: { reference: "Location/room-1" }, status: "accepted" },
          { actor: { reference: "Practitioner/doc-other" }, status: "accepted" },
        ],
      });

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])], "fd-conflict");
      built.identity.addToken("token-conflict", principal);

      // Attempt to book overlapping case in the same room
      const overlappingScheduledAt = new Date(startMs + 15 * 60 * 1000).toISOString();
      const response = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: bearer("token-conflict"),
        payload: {
          facilityId: "fac-a",
          patientId: "pat-new",
          roomId: "room-1",
          scheduledAt: overlappingScheduledAt,
          durationMinutes: 45,
          primaryPhysicianId: "doc-different",
          procedureIntent: "diagnostic",
          primaryProcedureCode: "43239",
        },
      });

      expect(response.statusCode).toBe(409);
      const json = response.json();
      expect(json.code).toBe("conflict");
      expect(json.reasons).toContainEqual({
        code: "ROOM_DOUBLE_BOOKED",
        message: "Operating room is already occupied during this time window",
      });
      expect(json.details?.ROOM_DOUBLE_BOOKED).toBe("Operating room is already occupied during this time window");
    });

    it("returns 409 conflict when primary physician has another procedure scheduled", async () => {
      const mockMedplum = new MockClient();

      const scheduledAt = futureInstant(96);
      const startMs = Date.parse(scheduledAt);
      const endMs = startMs + 60 * 60 * 1000;

      await seedPatient(mockMedplum, "fac-a", "pat-2");

      // Seed existing appointment with doc-busy in room-2
      await forFacility(mockMedplum, "fac-a").create({
        resourceType: "Appointment",
        status: "booked",
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
        participant: [
          { actor: { reference: "Patient/pat-1" }, status: "accepted" },
          { actor: { reference: "Location/room-2" }, status: "accepted" },
          {
            actor: { reference: "Practitioner/doc-busy" },
            status: "accepted",
            type: [{ coding: [{ code: "PPRF" }] }],
          },
        ],
      });

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])], "fd-doc-clash");
      built.identity.addToken("token-doc-clash", principal);

      // Attempt to book doc-busy in room-1 during the same window
      const response = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: bearer("token-doc-clash"),
        payload: {
          facilityId: "fac-a",
          patientId: "pat-2",
          roomId: "room-1",
          scheduledAt,
          durationMinutes: 45,
          primaryPhysicianId: "doc-busy",
          procedureIntent: "surveillance",
          primaryProcedureCode: "45380",
        },
      });

      expect(response.statusCode).toBe(409);
      const json = response.json();
      expect(json.code).toBe("conflict");
      expect(json.reasons).toContainEqual({
        code: "PHYSICIAN_DOUBLE_BOOKED",
        message: "Physician has another procedure scheduled during this time window",
      });
    });

    it("does not trigger conflict when existing appointment is cancelled or no-show", async () => {
      const mockMedplum = new MockClient();

      const scheduledAt = futureInstant(120);
      const startMs = Date.parse(scheduledAt);
      const endMs = startMs + 45 * 60 * 1000;

      await seedPatient(mockMedplum, "fac-a", "pat-new");

      // Seed cancelled appointment in room-1 with doc-1
      await forFacility(mockMedplum, "fac-a").create({
        resourceType: "Appointment",
        status: "cancelled",
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
        participant: [
          { actor: { reference: "Patient/pat-cancelled" }, status: "accepted" },
          { actor: { reference: "Location/room-1" }, status: "accepted" },
          { actor: { reference: "Practitioner/doc-1" }, status: "accepted" },
        ],
      });

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])], "fd-cancelled");
      built.identity.addToken("token-cancelled", principal);

      const response = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: bearer("token-cancelled"),
        payload: {
          facilityId: "fac-a",
          patientId: "pat-new",
          roomId: "room-1",
          scheduledAt,
          durationMinutes: 45,
          primaryPhysicianId: "doc-1",
          procedureIntent: "screening",
          primaryProcedureCode: "45378",
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it("returns 409 conflict when anesthesiologist is booked in another room", async () => {
      const mockMedplum = new MockClient();

      const scheduledAt = futureInstant(144);
      const startMs = Date.parse(scheduledAt);
      const endMs = startMs + 45 * 60 * 1000;

      await seedPatient(mockMedplum, "fac-a", "pat-2");

      // Seed existing appointment with crna-1 in room-2
      await forFacility(mockMedplum, "fac-a").create({
        resourceType: "Appointment",
        status: "booked",
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
        participant: [
          { actor: { reference: "Patient/pat-1" }, status: "accepted" },
          { actor: { reference: "Location/room-2" }, status: "accepted" },
          { actor: { reference: "Practitioner/doc-other" }, status: "accepted", type: [{ coding: [{ code: "PPRF" }] }] },
          { actor: { reference: "Practitioner/crna-1" }, status: "accepted", type: [{ coding: [{ code: "SPRF" }] }] },
        ],
      });

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])], "fd-anesthesia");
      built.identity.addToken("token-anesthesia", principal);

      // Attempt to book crna-1 in room-1 at the same time
      const response = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: bearer("token-anesthesia"),
        payload: {
          facilityId: "fac-a",
          patientId: "pat-2",
          roomId: "room-1",
          scheduledAt,
          durationMinutes: 45,
          primaryPhysicianId: "doc-dr-jones",
          anesthesiologistId: "crna-1",
          procedureIntent: "screening",
          primaryProcedureCode: "45378",
        },
      });

      expect(response.statusCode).toBe(409);
      const json = response.json();
      expect(json.code).toBe("conflict");
      expect(json.reasons).toContainEqual({
        code: "ANESTHESIA_DOUBLE_BOOKED",
        message: "Anesthesia provider is booked in another room during this time window",
      });
    });

    it("handles empty notes '' and multiline notes without 500 errors", async () => {
      const mockMedplum = new MockClient();
      await seedPatient(mockMedplum, "fac-a", "pat-1");
      await seedPatient(mockMedplum, "fac-a", "pat-2");

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])], "fd-notes");
      built.identity.addToken("token-notes", principal);

      // 1. Empty string notes
      const resEmpty = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: bearer("token-notes"),
        payload: {
          facilityId: "fac-a",
          patientId: "pat-1",
          roomId: "room-1",
          scheduledAt: futureInstant(168),
          durationMinutes: 30,
          primaryPhysicianId: "doc-1",
          procedureIntent: "screening",
          primaryProcedureCode: "45378",
          notes: "",
        },
      });
      expect(resEmpty.statusCode).toBe(201);

      // 2. Multiline notes with newline
      const resMultiline = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: bearer("token-notes"),
        payload: {
          facilityId: "fac-a",
          patientId: "pat-2",
          roomId: "room-2",
          scheduledAt: futureInstant(192),
          durationMinutes: 45,
          primaryPhysicianId: "doc-1",
          procedureIntent: "diagnostic",
          primaryProcedureCode: "43239",
          notes: "Screening colonoscopy.\nSedation required.",
        },
      });
      expect(resMultiline.statusCode).toBe(201);
    });

    it("returns 400 when roomId contains non-FHIR characters", async () => {
      const mockMedplum = new MockClient();

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])], "fd-room-bad");
      built.identity.addToken("token-room-bad", principal);

      const response = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: bearer("token-room-bad"),
        payload: {
          facilityId: "fac-a",
          patientId: "pat-1",
          roomId: "OR #1",
          scheduledAt: futureInstant(216),
          durationMinutes: 45,
          primaryPhysicianId: "doc-1",
          procedureIntent: "screening",
          primaryProcedureCode: "45378",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("invalid_payload");
    });

    it("returns 403 when caller has schedule.manage at fac-a but attempts to book for fac-b", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])],
        "user-fac-a-only",
      );
      built.identity.addToken("token-fac-a-only", principal);

      const response = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: bearer("token-fac-a-only"),
        payload: {
          facilityId: "fac-b",
          patientId: "pat-1",
          roomId: "room-1",
          scheduledAt: futureInstant(240),
          durationMinutes: 45,
          primaryPhysicianId: "doc-1",
          procedureIntent: "screening",
          primaryProcedureCode: "45378",
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it("does not trigger room conflict when an appointment with identical room ID is booked at a different facility", async () => {
      const mockMedplum = new MockClient();

      const scheduledAt = futureInstant(264);
      const startMs = Date.parse(scheduledAt);
      const endMs = startMs + 45 * 60 * 1000;

      // Seed existing booked appointment in room-1 at fac-b
      await forFacility(mockMedplum, "fac-b").create({
        resourceType: "Appointment",
        status: "booked",
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
        participant: [
          { actor: { reference: "Patient/pat-existing" }, status: "accepted" },
          { actor: { reference: "Location/room-1" }, status: "accepted" },
          { actor: { reference: "Practitioner/doc-other" }, status: "accepted" },
        ],
      });

      await seedPatient(mockMedplum, "fac-a", "pat-new");

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])],
        "fd-fac-a",
      );
      built.identity.addToken("token-fd-fac-a", principal);

      // Book the same room-1 at fac-a during the exact same time window
      const response = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: bearer("token-fd-fac-a"),
        payload: {
          facilityId: "fac-a",
          patientId: "pat-new",
          roomId: "room-1",
          scheduledAt,
          durationMinutes: 45,
          primaryPhysicianId: "doc-dr-jones",
          procedureIntent: "screening",
          primaryProcedureCode: "45378",
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it("detects room conflict across UTC date boundary when case spans into next UTC day", async () => {
      const mockMedplum = new MockClient();
      // 20:00 EDT (UTC-4) = 00:00 UTC next day
      const existingStart = "2026-10-26T00:15:00.000Z";
      const existingEnd = "2026-10-26T01:00:00.000Z";

      await seedPatient(mockMedplum, "fac-a", "pat-utc-test");

      await forFacility(mockMedplum, "fac-a").create<Appointment>({
        resourceType: "Appointment",
        status: "booked",
        start: existingStart,
        end: existingEnd,
        participant: [
          { actor: { reference: "Location/room-1" }, status: "accepted" },
          { actor: { reference: "Practitioner/doc-dr-jones" }, status: "accepted" },
        ],
      });

      const built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])],
        "fd-fac-a",
      );
      built.identity.addToken("token-fd-fac-a", principal);

      // Candidate at 00:30 UTC next day (overlapping the existing case)
      const response = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: bearer("token-fd-fac-a"),
        payload: {
          facilityId: "fac-a",
          patientId: "pat-utc-test",
          roomId: "room-1",
          scheduledAt: "2026-10-26T00:30:00.000Z",
          durationMinutes: 45,
          primaryPhysicianId: "doc-dr-smith",
          procedureIntent: "screening",
          primaryProcedureCode: "45378",
        },
      });

      expect(response.statusCode).toBe(409);
      const json = response.json();
      expect(json.code).toBe("conflict");
      expect(json.reasons?.[0]?.code).toBe("ROOM_DOUBLE_BOOKED");
    });

    it("returns 404 when patient does not exist", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])],
        "fd-fac-a",
      );
      built.identity.addToken("token-fd-fac-a", principal);

      const response = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: bearer("token-fd-fac-a"),
        payload: {
          facilityId: "fac-a",
          patientId: "nonexistent-pat",
          roomId: "room-1",
          scheduledAt: futureInstant(24),
          durationMinutes: 45,
          primaryPhysicianId: "doc-1",
          procedureIntent: "screening",
          primaryProcedureCode: "45378",
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: "patient_not_found" });
    });

    it("returns 403 when patient belongs to another facility (cross-facility protection)", async () => {
      const mockMedplum = new MockClient();
      // Patient belongs to fac-b only
      await seedPatient(mockMedplum, "fac-b", "pat-b-only");

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])],
        "fd-fac-a",
      );
      built.identity.addToken("token-fd-fac-a", principal);

      const response = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: bearer("token-fd-fac-a"),
        payload: {
          facilityId: "fac-a",
          patientId: "pat-b-only",
          roomId: "room-1",
          scheduledAt: futureInstant(24),
          durationMinutes: 45,
          primaryPhysicianId: "doc-1",
          procedureIntent: "screening",
          primaryProcedureCode: "45378",
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: "facility_access_denied" });

      // Invariant: Patient was NOT modified or stamped with fac-a
      const pat = await mockMedplum.readResource("Patient", "pat-b-only");
      expect(pat.meta?.accounts?.some((a) => a.reference === "Organization/fac-a")).toBe(false);
    });

    it("recovers idempotently on duplicate booking retry without returning 409 conflict", async () => {
      const mockMedplum = new MockClient();
      await seedPatient(mockMedplum, "fac-a", "pat-idempotent");

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])],
        "fd-fac-a",
      );
      built.identity.addToken("token-fd-fac-a", principal);

      const scheduledAt = futureInstant(36);
      const payload = {
        facilityId: "fac-a",
        patientId: "pat-idempotent",
        roomId: "room-1",
        scheduledAt,
        durationMinutes: 45,
        primaryPhysicianId: "doc-1",
        procedureIntent: "screening",
        primaryProcedureCode: "45378",
      };

      // 1. First booking -> 201 Created
      const res1 = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: { ...bearer("token-fd-fac-a"), "x-idempotency-key": "retry-key-abc" },
        payload,
      });
      expect(res1.statusCode).toBe(201);
      const json1 = res1.json();

      // 2. Client retry with identical idempotency key -> 200 OK (idempotent recovery)
      const res2 = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: { ...bearer("token-fd-fac-a"), "x-idempotency-key": "retry-key-abc" },
        payload,
      });
      expect(res2.statusCode).toBe(200);
      const json2 = res2.json();
      expect(json2.appointmentId).toBe(json1.appointmentId);
      expect(json2.caseId).toBe(json1.caseId);
    });

    it("concurrency lock: serializes concurrent booking requests to avoid race conditions", async () => {
      const mockMedplum = new MockClient();
      await seedPatient(mockMedplum, "fac-a", "pat-concurrent-1");
      await seedPatient(mockMedplum, "fac-a", "pat-concurrent-2");

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])],
        "fd-fac-a",
      );
      built.identity.addToken("token-fd-fac-a", principal);

      const scheduledAt = futureInstant(48);

      // Two different patients attempt to book the exact same room at the exact same time concurrently
      const [res1, res2] = await Promise.all([
        built.app.inject({
          method: "POST",
          url: "/cases",
          headers: bearer("token-fd-fac-a"),
          payload: {
            facilityId: "fac-a",
            patientId: "pat-concurrent-1",
            roomId: "room-3",
            scheduledAt,
            durationMinutes: 45,
            primaryPhysicianId: "doc-dr-smith",
            procedureIntent: "screening",
            primaryProcedureCode: "45378",
          },
        }),
        built.app.inject({
          method: "POST",
          url: "/cases",
          headers: bearer("token-fd-fac-a"),
          payload: {
            facilityId: "fac-a",
            patientId: "pat-concurrent-2",
            roomId: "room-3",
            scheduledAt,
            durationMinutes: 45,
            primaryPhysicianId: "doc-dr-jones",
            procedureIntent: "diagnostic",
            primaryProcedureCode: "43239",
          },
        }),
      ]);

      const statuses = [res1.statusCode, res2.statusCode].sort();
      // Exactly one succeeds (201) and one is rejected with 409 conflict
      expect(statuses).toEqual([201, 409]);
    });

    it("rejects booking with 400 invalid_room when roomId is not an ASC procedure room", async () => {
      const mockMedplum = new MockClient();
      await seedPatient(mockMedplum, "fac-a", "pat-room-test");

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])],
        "fd-fac-a",
      );
      built.identity.addToken("token-fd-fac-a", principal);

      const res = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: bearer("token-fd-fac-a"),
        payload: {
          facilityId: "fac-a",
          patientId: "pat-room-test",
          roomId: "OR-99",
          scheduledAt: futureInstant(10),
          durationMinutes: 45,
          primaryPhysicianId: "doc-1",
          procedureIntent: "screening",
          primaryProcedureCode: "45378",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("invalid_room");
      expect(body.message).toContain("OR-99");
    });

    it("rejects booking with 400 inactive_or_invalid_practitioner when primary physician is inactive", async () => {
      const mockMedplum = new MockClient();
      await seedPatient(mockMedplum, "fac-a", "pat-prac-test");

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])],
        "fd-fac-a",
      );
      built.identity.addToken("token-fd-fac-a", principal);

      const res = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: bearer("token-fd-fac-a"),
        payload: {
          facilityId: "fac-a",
          patientId: "pat-prac-test",
          roomId: "room-1",
          scheduledAt: futureInstant(12),
          durationMinutes: 45,
          primaryPhysicianId: "inactive-doc-smith",
          procedureIntent: "screening",
          primaryProcedureCode: "45378",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("inactive_or_invalid_practitioner");
      expect(body.message).toContain("inactive");
    });

    it("rejects booking with 400 inactive_or_invalid_practitioner when anesthesiologist is inactive", async () => {
      const mockMedplum = new MockClient();
      await seedPatient(mockMedplum, "fac-a", "pat-anes-test");

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])],
        "fd-fac-a",
      );
      built.identity.addToken("token-fd-fac-a", principal);

      const res = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: bearer("token-fd-fac-a"),
        payload: {
          facilityId: "fac-a",
          patientId: "pat-anes-test",
          roomId: "room-1",
          scheduledAt: futureInstant(14),
          durationMinutes: 45,
          primaryPhysicianId: "doc-1",
          anesthesiologistId: "inactive-anes-dr",
          procedureIntent: "screening",
          primaryProcedureCode: "45378",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe("inactive_or_invalid_practitioner");
      expect(body.message).toContain("inactive");
    });

    it("rejects booking with 404 primary_physician_not_found when primary physician is not found", async () => {
      const mockMedplum = new MockClient();
      await seedPatient(mockMedplum, "fac-a", "pat-nonexistent-doc");

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])],
        "fd-fac-a",
      );
      built.identity.addToken("token-fd-fac-a", principal);

      const res = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: bearer("token-fd-fac-a"),
        payload: {
          facilityId: "fac-a",
          patientId: "pat-nonexistent-doc",
          roomId: "room-1",
          scheduledAt: futureInstant(16),
          durationMinutes: 45,
          primaryPhysicianId: "nonexistent-doc-jones",
          procedureIntent: "screening",
          primaryProcedureCode: "45378",
        },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.code).toBe("primary_physician_not_found");
    });

    it("rejects booking with 403 forbidden when patient read returns forbidden", async () => {
      const mockMedplum = new MockClient();

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])],
        "fd-fac-a",
      );
      built.identity.addToken("token-fd-fac-a", principal);

      const res = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: bearer("token-fd-fac-a"),
        payload: {
          facilityId: "fac-a",
          patientId: "forbidden-pat-secret",
          roomId: "room-1",
          scheduledAt: futureInstant(18),
          durationMinutes: 45,
          primaryPhysicianId: "doc-1",
          procedureIntent: "screening",
          primaryProcedureCode: "45378",
        },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.code).toBe("forbidden");
    });

    it("rejects booking with 503 upstream_service_unavailable when patient read encounters network timeout", async () => {
      const mockMedplum = new MockClient();

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])],
        "fd-fac-a",
      );
      built.identity.addToken("token-fd-fac-a", principal);

      const res = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: bearer("token-fd-fac-a"),
        payload: {
          facilityId: "fac-a",
          patientId: "unavailable-pat-timeout",
          roomId: "room-1",
          scheduledAt: futureInstant(20),
          durationMinutes: 45,
          primaryPhysicianId: "doc-1",
          procedureIntent: "screening",
          primaryProcedureCode: "45378",
        },
      });

      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.code).toBe("upstream_service_unavailable");
    });

    it("rejects booking with 409 idempotency_key_conflict when idempotency key was previously used for a different patient", async () => {
      const mockMedplum = new MockClient();
      await seedPatient(mockMedplum, "fac-a", "pat-user-alpha");
      await seedPatient(mockMedplum, "fac-a", "pat-user-beta");

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])],
        "fd-fac-a",
      );
      built.identity.addToken("token-fd-fac-a", principal);

      const sharedKey = "shared-idempotency-key-123";

      // 1. Initial booking for patient alpha
      const res1 = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: { ...bearer("token-fd-fac-a"), "x-idempotency-key": sharedKey },
        payload: {
          facilityId: "fac-a",
          patientId: "pat-user-alpha",
          roomId: "room-1",
          scheduledAt: futureInstant(22),
          durationMinutes: 45,
          primaryPhysicianId: "doc-1",
          procedureIntent: "screening",
          primaryProcedureCode: "45378",
        },
      });
      expect(res1.statusCode).toBe(201);

      // 2. Duplicate booking with same key for patient beta -> 409 conflict
      const res2 = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: { ...bearer("token-fd-fac-a"), "x-idempotency-key": sharedKey },
        payload: {
          facilityId: "fac-a",
          patientId: "pat-user-beta",
          roomId: "room-2",
          scheduledAt: futureInstant(24),
          durationMinutes: 45,
          primaryPhysicianId: "doc-1",
          procedureIntent: "diagnostic",
          primaryProcedureCode: "43239",
        },
      });
      expect(res2.statusCode).toBe(409);
      const body2 = res2.json();
      expect(body2.code).toBe("idempotency_key_conflict");
    });

    it("fails safely with 500 incomplete_transaction when previous transaction is incomplete", async () => {
      const mockMedplum = new MockClient();
      await seedPatient(mockMedplum, "fac-a", "pat-partial");

      // Manually seed an appointment with the idempotency key, but NO linked encounter or service request
      const partialKey = "partial-failure-key-456";
      await forFacility(mockMedplum, "fac-a").create({
        resourceType: "Appointment",
        status: "booked",
        identifier: [bookingIdempotencyIdentifier(partialKey)],
        start: futureInstant(26),
        end: futureInstant(27),
        participant: [
          { actor: { reference: "Patient/pat-partial" }, status: "accepted" },
          { actor: { reference: "Location/room-1" }, status: "accepted" },
        ],
      });

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["schedule.manage"])],
        "fd-fac-a",
      );
      built.identity.addToken("token-fd-fac-a", principal);

      const res = await built.app.inject({
        method: "POST",
        url: "/cases",
        headers: { ...bearer("token-fd-fac-a"), "x-idempotency-key": partialKey },
        payload: {
          facilityId: "fac-a",
          patientId: "pat-partial",
          roomId: "room-1",
          scheduledAt: futureInstant(26),
          durationMinutes: 45,
          primaryPhysicianId: "doc-1",
          procedureIntent: "screening",
          primaryProcedureCode: "45378",
        },
      });

      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(body.code).toBe("incomplete_transaction");
      expect(body.message).toContain("encounter is missing");
    });
  });

  describe("classifyMedplumReadError", () => {
    it("classifies 404 and not-found messages as not_found", () => {
      const errStatus = Object.assign(new Error("Missing"), { status: 404 });
      expect(classifyMedplumReadError(errStatus, "patient", "pat-99")).toEqual({
        status: 404,
        code: "patient_not_found",
        message: "patient with ID pat-99 does not exist",
      });

      const errMessage = new Error("Patient not found in storage");
      expect(classifyMedplumReadError(errMessage, "primary_physician", "doc-99")).toEqual({
        status: 404,
        code: "primary_physician_not_found",
        message: "primary physician with ID doc-99 does not exist",
      });
    });

    it("classifies 401/403 and forbidden messages as forbidden", () => {
      const errForbidden = Object.assign(new Error("Forbidden"), { status: 403 });
      expect(classifyMedplumReadError(errForbidden, "anesthesiologist", "anes-1")).toEqual({
        status: 403,
        code: "forbidden",
        message: "Access denied reading anesthesiologist anes-1",
      });

      const errUnauthorized = new Error("Unauthorized access");
      expect(classifyMedplumReadError(errUnauthorized, "patient", "pat-1")).toEqual({
        status: 403,
        code: "forbidden",
        message: "Access denied reading patient pat-1",
      });
    });

    it("classifies 502/503/504 and network errors as upstream_service_unavailable", () => {
      const err503 = Object.assign(new Error("Service Unavailable"), { status: 503 });
      expect(classifyMedplumReadError(err503, "patient", "pat-1")).toEqual({
        status: 503,
        code: "upstream_service_unavailable",
        message: "Upstream clinical data service is temporarily unavailable",
      });

      const errTimeout = new Error("Gateway connection timeout");
      expect(classifyMedplumReadError(errTimeout, "patient", "pat-1")).toEqual({
        status: 503,
        code: "upstream_service_unavailable",
        message: "Upstream clinical data service is temporarily unavailable",
      });

      const errConnRefused = new Error("read ECONNREFUSED 127.0.0.1:8203");
      expect(classifyMedplumReadError(errConnRefused, "primary_physician", "doc-1")).toEqual({
        status: 503,
        code: "upstream_service_unavailable",
        message: "Upstream clinical data service is temporarily unavailable",
      });
    });

    it("classifies unexpected errors as internal_error", () => {
      const err500 = Object.assign(new Error("Database crash"), { status: 500 });
      expect(classifyMedplumReadError(err500, "patient", "pat-1")).toEqual({
        status: 500,
        code: "internal_error",
        message: "Unexpected error reading patient",
      });
    });
  });
});

