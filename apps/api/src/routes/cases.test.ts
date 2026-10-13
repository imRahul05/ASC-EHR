import { forFacility } from "@asc/api-client/server";
import { facilityGrant, staffPrincipal } from "@asc/authz/testing";
import { ClientStorage, MemoryStorage, ReadablePromise, type WithId } from "@medplum/core";
import type { Appointment, Bundle, ExtractResource, ResourceType } from "@medplum/fhirtypes";
import { MockClient as BaseMockClient } from "@medplum/mock";
import { afterEach, describe, expect, it } from "vitest";

import { buildTestApp } from "../testing/test-app.js";

type MedplumQuery = Parameters<BaseMockClient["search"]>[1];
type MedplumOptions = Parameters<BaseMockClient["search"]>[2];

class MockClient extends BaseMockClient {
  constructor() {
    super({ storage: new ClientStorage(new MemoryStorage()) });
  }

  override search<RT extends ResourceType>(
    resourceType: RT,
    query?: MedplumQuery,
    options?: MedplumOptions,
  ): ReadablePromise<Bundle<WithId<ExtractResource<RT>>>> {
    let accountFilter: string | undefined;
    let dateFilter: string | undefined;
    let cleanQuery = query;

    if (
      query !== undefined &&
      typeof query === "object" &&
      !(query instanceof URLSearchParams) &&
      !Array.isArray(query) &&
      !("resourceType" in query)
    ) {
      const copy: Record<string, string | number | boolean | undefined> = { ...query };
      const rawAccount = copy["_account"];
      if (typeof rawAccount === "string") {
        accountFilter = rawAccount;
        delete copy["_account"];
      }
      const rawDate = copy["date"];
      if (typeof rawDate === "string") {
        dateFilter = rawDate;
        delete copy["date"];
      }
      cleanQuery = copy;
    }

    const bundlePromise = super.search(resourceType, cleanQuery, options).then((bundle) => {
      let filteredEntries = bundle.entry;
      if (accountFilter !== undefined) {
        filteredEntries = filteredEntries?.filter((e) =>
          e.resource?.meta?.accounts?.some((a) => a.reference === accountFilter),
        );
      }
      if (dateFilter !== undefined) {
        filteredEntries = filteredEntries?.filter((e) => {
          const appItem = e.resource as Appointment | undefined;
          return appItem?.start?.startsWith(dateFilter);
        });
      }
      return {
        ...bundle,
        total: filteredEntries?.length ?? 0,
        entry: filteredEntries !== undefined && filteredEntries.length > 0 ? filteredEntries : undefined,
      };
    });
    return new ReadablePromise(bundlePromise);
  }
}

type Built = Awaited<ReturnType<typeof buildTestApp>>;
let built: Built | undefined;

afterEach(async () => {
  await built?.app.close();
  built = undefined;
});

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

const futureInstant = (offsetHours = 24) =>
  new Date(Date.now() + offsetHours * 3600 * 1000).toISOString();

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
  });
});
