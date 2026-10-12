import { forFacility } from "@asc/api-client/server";
import { facilityGrant, staffPrincipal } from "@asc/authz/testing";
import { ClientStorage, MemoryStorage } from "@medplum/core";
import { MockClient as BaseMockClient } from "@medplum/mock";
import { afterEach, describe, expect, it } from "vitest";

import { buildTestApp } from "../testing/test-app.js";

class MockClient extends BaseMockClient {
  constructor() {
    super({ storage: new ClientStorage(new MemoryStorage()) });
  }
}

type Built = Awaited<ReturnType<typeof buildTestApp>>;
let built: Built | undefined;

afterEach(async () => {
  await built?.app.close();
  built = undefined;
});

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("Patients routes", () => {
  describe("GET /patients/search", () => {
    it("returns 401 when unauthenticated", async () => {
      built = await buildTestApp({ medplumBaseUrl: "http://localhost:8203/" });
      const response = await built.app.inject({
        method: "GET",
        url: "/patients/search",
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns 403 when caller lacks patient.read capability at the facility", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      // User has case.read at fac-a, but NOT patient.read
      const principal = staffPrincipal([facilityGrant("fac-a", ["rn"], ["case.read"])], "user-1");
      built.identity.addToken("token-1", principal);

      const response = await built.app.inject({
        method: "GET",
        url: "/patients/search?facilityId=fac-a",
        headers: bearer("token-1"),
      });

      expect(response.statusCode).toBe(403);
    });

    it("returns matching patients when caller has patient.read", async () => {
      const mockMedplum = new MockClient();
      await forFacility(mockMedplum, "fac-a").create({
        resourceType: "Patient",
        name: [{ family: "Smith", given: ["Alice"] }],
        birthDate: "1980-01-01",
      });

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-a", ["intake"], ["patient.read"])], "intake-1");
      built.identity.addToken("token-intake", principal);

      const response = await built.app.inject({
        method: "GET",
        url: "/patients/search?facilityId=fac-a&name=Smith",
        headers: bearer("token-intake"),
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.total).toBeGreaterThanOrEqual(1);
      expect(json.patients).toBeDefined();
    });

    it("resolves the caller's granted facility when facilityId is omitted", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-default", ["intake"], ["patient.read"])], "intake-2");
      built.identity.addToken("token-default", principal);

      const response = await built.app.inject({
        method: "GET",
        url: "/patients/search",
        headers: bearer("token-default"),
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("POST /patients/register", () => {
    it("returns 401 when unauthenticated", async () => {
      built = await buildTestApp({ medplumBaseUrl: "http://localhost:8203/" });
      const response = await built.app.inject({
        method: "POST",
        url: "/patients/register",
        payload: {
          name: { family: "Doe", given: ["John"] },
          dateOfBirth: "1990-01-01",
          gender: "male",
          phone: "555-123-4567",
        },
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns 403 when caller lacks patient.write capability at target facility", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-a", ["rn"], ["patient.read"])], "rn-1");
      built.identity.addToken("token-rn", principal);

      const response = await built.app.inject({
        method: "POST",
        url: "/patients/register",
        headers: bearer("token-rn"),
        payload: {
          facilityId: "fac-a",
          name: { family: "Doe", given: ["John"] },
          dateOfBirth: "1990-01-01",
          gender: "male",
          phone: "555-123-4567",
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

      // Caller has patient.register capability, but payload and headers omit facilityId
      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["patient.register"])],
        "user-no-fac",
      );
      built.identity.addToken("token-no-fac", principal);

      const response = await built.app.inject({
        method: "POST",
        url: "/patients/register",
        headers: bearer("token-no-fac"),
        payload: {
          name: { family: "Doe", given: ["John"] },
          dateOfBirth: "1990-01-01",
          gender: "male",
          phone: "555-123-4567",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "bad_request" });
    });

    it("creates Patient, Coverage, and RelatedPerson when registration is complete", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-a", ["front-desk"], ["patient.register"])], "fd-1");
      built.identity.addToken("token-fd", principal);

      const payload = {
        facilityId: "fac-a",
        name: { family: "Smith", given: ["Bob"] },
        dateOfBirth: "1975-06-20",
        gender: "male",
        phone: "(555) 321-7654",
        email: "bob.smith@example.com",
        mrn: "MRN-5544",
        insurance: {
          payerId: "org-payer-1",
          planName: "Advantage Care",
          memberId: "MEM-7711",
          groupNumber: "GRP-99",
          relationship: "self",
        },
        escort: {
          name: "Mary Smith",
          phone: "(555) 321-9999",
          relationship: "spouse",
        },
      };

      const response = await built.app.inject({
        method: "POST",
        url: "/patients/register",
        headers: bearer("token-fd"),
        payload,
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.patient).toBeDefined();
      expect(json.patient.id).toBeDefined();
      expect(json.patient.meta?.accounts?.[0]?.reference).toBe("Organization/fac-a");
      expect(json.coverage).toBeDefined();
      expect(json.coverage.id).toBeDefined();
      expect(json.escort).toBeDefined();
      expect(json.escort.id).toBeDefined();
      expect(json.duplicateMatch?.hasMatch).toBe(false);
    });

    it("creates Patient without coverage or escort when omitted", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-a", ["front-desk"], ["patient.register"])], "fd-2");
      built.identity.addToken("token-fd-2", principal);

      const payload = {
        facilityId: "fac-a",
        name: { family: "Alone", given: ["Patient"] },
        dateOfBirth: "1988-11-11",
        gender: "other",
        phone: "(555) 777-8888",
      };

      const response = await built.app.inject({
        method: "POST",
        url: "/patients/register",
        headers: bearer("token-fd-2"),
        payload,
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.patient).toBeDefined();
      expect(json.coverage).toBeUndefined();
      expect(json.escort).toBeUndefined();
    });

    it("blocks registration with 409 when high-confidence duplicate is detected", async () => {
      const mockMedplum = new MockClient();
      // Pre-seed matching patient
      await forFacility(mockMedplum, "fac-a").create({
        resourceType: "Patient",
        name: [{ family: "Duplicate", given: ["Jane"] }],
        birthDate: "1992-03-15",
        gender: "female",
      });

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-a", ["front-desk"], ["patient.register"])], "fd-3");
      built.identity.addToken("token-fd-3", principal);

      const payload = {
        facilityId: "fac-a",
        name: { family: "Duplicate", given: ["Jane"] },
        dateOfBirth: "1992-03-15",
        gender: "female",
        phone: "(555) 444-3333",
      };

      const response = await built.app.inject({
        method: "POST",
        url: "/patients/register",
        headers: bearer("token-fd-3"),
        payload,
      });

      expect(response.statusCode).toBe(409);
      const json = response.json();
      expect(json.code).toBe("duplicate_patient_detected");
      expect(json.duplicateMatch?.hasMatch).toBe(true);
      expect(json.duplicateMatch?.highestConfidence).toBe("high");
    });

    it("allows registration when confirmDuplicate is true even if duplicate matches", async () => {
      const mockMedplum = new MockClient();
      await forFacility(mockMedplum, "fac-a").create({
        resourceType: "Patient",
        name: [{ family: "Duplicate", mechanicalGiven: undefined, given: ["Jane"] }],
        birthDate: "1992-03-15",
        gender: "female",
      });

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-a", ["front-desk"], ["patient.register"])], "fd-4");
      built.identity.addToken("token-fd-4", principal);

      const payload = {
        facilityId: "fac-a",
        name: { family: "Duplicate", given: ["Jane"] },
        dateOfBirth: "1992-03-15",
        gender: "female",
        phone: "(555) 444-3333",
        confirmDuplicate: true,
      };

      const response = await built.app.inject({
        method: "POST",
        url: "/patients/register",
        headers: bearer("token-fd-4"),
        payload,
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.patient.id).toBeDefined();
      expect(json.duplicateMatch?.hasMatch).toBe(true);
    });
  });

  describe("PHI Hygiene (LM-018 / LM-024)", () => {
    it("never echoes patient name, date of birth or phone in audit event details on denial", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-b", ["rn"], ["patient.read"])], "unauth-user");
      built.identity.addToken("token-unauth", principal);

      const canaryName = "CANARY_NAME_CONFIDENTIAL";
      const canaryPhone = "555-888-9999";
      const canaryDob = "1977-07-07";

      await built.app.inject({
        method: "POST",
        url: "/patients/register",
        headers: bearer("token-unauth"),
        payload: {
          facilityId: "fac-a",
          name: { family: canaryName, given: ["Confidential"] },
          dateOfBirth: canaryDob,
          gender: "male",
          phone: canaryPhone,
        },
      });

      const eventsJson = JSON.stringify(built.audit.events);
      expect(eventsJson).not.toContain(canaryName);
      expect(eventsJson).not.toContain(canaryPhone);
      expect(eventsJson).not.toContain(canaryDob);
    });
  });
});
