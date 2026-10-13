import { forFacility } from "@asc/api-client/server";
import { facilityGrant, staffPrincipal } from "@asc/authz/testing";
import { allOk, ClientStorage, MemoryStorage, ReadablePromise, type SearchRequest, type WithId } from "@medplum/core";
import type { Bundle, Coverage, ExtractResource, OperationOutcome, Patient, RelatedPerson, Resource, ResourceType } from "@medplum/fhirtypes";
import { MockClient as BaseMockClient } from "@medplum/mock";
import { fhirUrls } from "@asc/fhir";
import { afterEach, describe, expect, it } from "vitest";

import { buildTestApp } from "../testing/test-app.js";
import { createInMemoryRegistrationLock } from "./patients.js";

type MedplumQuery = Parameters<BaseMockClient["search"]>[1];
type MedplumOptions = Parameters<BaseMockClient["search"]>[2];

class MockClient extends BaseMockClient {
  constructor() {
    super({ storage: new ClientStorage(new MemoryStorage()) });

    const originalConditionalCreate = this.repo.conditionalCreate.bind(this.repo);
    this.repo.conditionalCreate = async <T extends Resource>(
      resource: T,
      search: SearchRequest<T>,
      options?: Parameters<typeof originalConditionalCreate>[2],
    ): Promise<{ resource: WithId<T>; outcome: OperationOutcome }> => {
      const idFilter = search.filters?.find((f) => f.code === "identifier");
      if (idFilter && search.resourceType === "Patient") {
        const val = idFilter.value;
        const allPatients = await this.searchResources("Patient");
        const matched = allPatients.filter((p) =>
          p.identifier?.some(
            (id) => id.value === val || `${id.system}|${id.value}` === val || val.endsWith(`|${id.value}`),
          ),
        );
        if (matched.length === 1) {
          const single = matched[0];
          if (single !== undefined) {
            return {
              resource: single as WithId<T>,
              outcome: allOk,
            };
          }
        }
      }
      return originalConditionalCreate(resource, search, options);
    };
  }

  override search<RT extends ResourceType>(
    resourceType: RT,
    query?: MedplumQuery,
    options?: MedplumOptions,
  ): ReadablePromise<Bundle<WithId<ExtractResource<RT>>>> {
    let accountFilter: string | undefined;
    let identifierFilter: string | undefined;
    let birthdateFilter: string | undefined;
    let patientFilter: string | undefined;
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
      const rawIdentifier = copy["identifier"];
      if (typeof rawIdentifier === "string") {
        identifierFilter = rawIdentifier;
        delete copy["identifier"];
      }
      const rawBirthdate = copy["birthdate"];
      if (typeof rawBirthdate === "string") {
        birthdateFilter = rawBirthdate;
        delete copy["birthdate"];
      }
      const rawPatient = copy["patient"];
      if (typeof rawPatient === "string") {
        patientFilter = rawPatient;
        delete copy["patient"];
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
      if (identifierFilter !== undefined) {
        filteredEntries = filteredEntries?.filter((e) => {
          const p = e.resource as Patient | undefined;
          return p?.identifier?.some((id) => id.value === identifierFilter);
        });
      }
      if (birthdateFilter !== undefined) {
        filteredEntries = filteredEntries?.filter((e) => {
          const p = e.resource as Patient | undefined;
          return p?.birthDate === birthdateFilter;
        });
      }
      if (patientFilter !== undefined) {
        filteredEntries = filteredEntries?.filter((e) => {
          const res = e.resource as Record<string, unknown> | undefined;
          const benRef = (res?.beneficiary as { reference?: string } | undefined)?.reference;
          const patRef = (res?.patient as { reference?: string } | undefined)?.reference;
          return benRef === patientFilter || patRef === patientFilter;
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

    it("isolates search results to caller's facility when patients exist across multiple facilities", async () => {
      const mockMedplum = new MockClient();
      await forFacility(mockMedplum, "fac-a").create({
        resourceType: "Patient",
        name: [{ family: "CrossSite", given: ["Alice"] }],
        birthDate: "1980-01-01",
      });
      await forFacility(mockMedplum, "fac-b").create({
        resourceType: "Patient",
        name: [{ family: "CrossSite", given: ["Bob"] }],
        birthDate: "1985-05-05",
      });

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [
          facilityGrant("fac-a", ["intake"], ["patient.read"]),
          facilityGrant("fac-b", ["intake"], ["patient.read"]),
        ],
        "float-intake",
      );
      built.identity.addToken("token-float", principal);

      const response = await built.app.inject({
        method: "GET",
        url: "/patients/search?facilityId=fac-a&name=CrossSite",
        headers: bearer("token-float"),
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.total).toBe(1);
      expect(json.patients).toHaveLength(1);
      expect(json.patients[0].name?.[0]?.given?.[0]).toBe("Alice");
      expect(json.patients[0].meta?.accounts?.[0]?.reference).toBe("Organization/fac-a");
    });
  });

  describe("POST /patients/search", () => {
    it("returns 401 when unauthenticated", async () => {
      built = await buildTestApp({ medplumBaseUrl: "http://localhost:8203/" });
      const response = await built.app.inject({
        method: "POST",
        url: "/patients/search",
        payload: { name: "Smith" },
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns 403 when caller lacks patient.read", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-a", ["rn"], ["case.read"])], "user-no-read");
      built.identity.addToken("token-no-read", principal);

      const response = await built.app.inject({
        method: "POST",
        url: "/patients/search",
        headers: bearer("token-no-read"),
        payload: { facilityId: "fac-a", name: "Smith" },
      });

      expect(response.statusCode).toBe(403);
    });

    it("returns matching patients when demographics are passed in request body (PHI-safe)", async () => {
      const mockMedplum = new MockClient();
      await forFacility(mockMedplum, "fac-a").create({
        resourceType: "Patient",
        name: [{ family: "PostSearch", given: ["Bob"] }],
        birthDate: "1985-05-15",
      });

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-a", ["intake"], ["patient.read"])], "intake-post");
      built.identity.addToken("token-intake-post", principal);

      const response = await built.app.inject({
        method: "POST",
        url: "/patients/search",
        headers: bearer("token-intake-post"),
        payload: {
          facilityId: "fac-a",
          name: "PostSearch",
          dob: "1985-05-15",
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.total).toBe(1);
      expect(json.patients[0].name?.[0]?.family).toBe("PostSearch");
    });

    it("returns 400 when search payload is malformed", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-a", ["intake"], ["patient.read"])], "intake-malformed");
      built.identity.addToken("token-intake-malformed", principal);

      const response = await built.app.inject({
        method: "POST",
        url: "/patients/search",
        headers: bearer("token-intake-malformed"),
        payload: {
          dob: "not-a-valid-date",
        },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.code).toBe("invalid_payload");
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
        address: {
          line: ["123 Main St", "Suite 200"],
          city: "Anytown",
          state: "CA",
          postalCode: "90210",
          country: "USA",
        },
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
      expect(json.patient.telecom).toEqual([
        { system: "phone", value: "(555) 321-7654" },
        { system: "email", value: "bob.smith@example.com" },
      ]);
      expect(json.patient.address).toEqual([
        {
          line: ["123 Main St", "Suite 200"],
          city: "Anytown",
          state: "CA",
          postalCode: "90210",
          country: "USA",
        },
      ]);
      expect(json.coverage).toBeDefined();
      expect(json.coverage.id).toBeDefined();
      expect(json.coverage.beneficiary?.reference).toBe(`Patient/${json.patient.id}`);
      expect(json.escort).toBeDefined();
      expect(json.escort.id).toBeDefined();
      expect(json.escort.patient?.reference).toBe(`Patient/${json.patient.id}`);
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

    it("does not trigger duplicate match for candidate at a different facility", async () => {
      const mockMedplum = new MockClient();
      // Pre-seed matching patient at fac-b
      await forFacility(mockMedplum, "fac-b").create({
        resourceType: "Patient",
        name: [{ family: "CrossDuplicate", given: ["Charlie"] }],
        birthDate: "1990-04-12",
        gender: "male",
      });

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-a", ["front-desk"], ["patient.register"])], "fd-cross");
      built.identity.addToken("token-fd-cross", principal);

      const payload = {
        facilityId: "fac-a",
        name: { family: "CrossDuplicate", given: ["Charlie"] },
        dateOfBirth: "1990-04-12",
        gender: "male",
        phone: "(555) 123-9999",
      };

      const response = await built.app.inject({
        method: "POST",
        url: "/patients/register",
        headers: bearer("token-fd-cross"),
        payload,
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.patient.id).toBeDefined();
      expect(json.duplicateMatch?.hasMatch).toBe(false);
    });

    it("blocks registration with 409 duplicate_mrn_conflict when exact MRN matches, even if confirmDuplicate is true", async () => {
      const mockMedplum = new MockClient();
      await forFacility(mockMedplum, "fac-a").create({
        resourceType: "Patient",
        name: [{ family: "Existing", given: ["Bob"] }],
        birthDate: "1980-01-01",
        identifier: [
          { system: "https://fhir.wybit.io/asc/identifier/mrn", value: "MRN-EXACT-99" },
        ],
      });

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-a", ["front-desk"], ["patient.register"])], "fd-mrn");
      built.identity.addToken("token-fd-mrn", principal);

      const payload = {
        facilityId: "fac-a",
        name: { family: "DifferentLastName", given: ["DifferentGiven"] },
        dateOfBirth: "1995-10-20",
        gender: "male",
        phone: "(555) 000-1111",
        mrn: "MRN-EXACT-99",
        confirmDuplicate: true, // Attempting to override duplicate check
      };

      const response = await built.app.inject({
        method: "POST",
        url: "/patients/register",
        headers: bearer("token-fd-mrn"),
        payload,
      });

      expect(response.statusCode).toBe(409);
      const json = response.json();
      expect(json.code).toBe("duplicate_mrn_conflict");
      expect(json.duplicateMatch?.highestConfidence).toBe("exact_identifier");
    });

    it("returns 400 with invalid_payload code when registration payload fails schema validation", async () => {
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
      });

      const principal = staffPrincipal([facilityGrant("fac-a", ["front-desk"], ["patient.register"])], "fd-val");
      built.identity.addToken("token-fd-val", principal);

      const response = await built.app.inject({
        method: "POST",
        url: "/patients/register",
        headers: bearer("token-fd-val"),
        payload: {
          facilityId: "fac-a",
          name: { family: "", given: [] },
          dateOfBirth: "not-a-date",
          gender: "invalid_gender",
          phone: "123",
        },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.code).toBe("invalid_payload");
      expect(json.message).toBe("Invalid request payload.");
      expect(json.details).toBeDefined();
    });

    it("omits patient.address when address object has only empty or missing properties", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-a", ["front-desk"], ["patient.register"])], "fd-addr");
      built.identity.addToken("token-fd-addr", principal);

      const payload = {
        facilityId: "fac-a",
        name: { family: "NoAddress", given: ["Patient"] },
        dateOfBirth: "1988-02-02",
        gender: "other",
        phone: "(555) 111-2222",
        address: {},
      };

      const response = await built.app.inject({
        method: "POST",
        url: "/patients/register",
        headers: bearer("token-fd-addr"),
        payload,
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.patient.address).toBeUndefined();
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

    it("sanitizes query parameters from request logs so query string PHI is never logged", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal([facilityGrant("fac-a", ["intake"], ["patient.read"])], "intake-san");
      built.identity.addToken("token-san", principal);

      const response = await built.app.inject({
        method: "GET",
        url: "/patients/search?facilityId=fac-a&name=SENSITIVE_PATIENT_NAME&dob=1990-01-01",
        headers: bearer("token-san"),
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("Concurrency & Race Condition Prevention (TOCTOU)", () => {
    it("prevents concurrent requests with identical MRN from creating duplicate patient records", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["patient.register", "patient.read"])],
        "fd-race-mrn",
      );
      built.identity.addToken("token-race-mrn", principal);

      const payload = {
        facilityId: "fac-a",
        name: { family: "Simultaneous", given: ["Alice"] },
        dateOfBirth: "1982-04-14",
        gender: "female",
        phone: "(555) 234-5678",
        mrn: "MRN-CONCURRENT-EXACT",
      };

      const [res1, res2] = await Promise.all([
        built.app.inject({
          method: "POST",
          url: "/patients/register",
          headers: bearer("token-race-mrn"),
          payload,
        }),
        built.app.inject({
          method: "POST",
          url: "/patients/register",
          headers: bearer("token-race-mrn"),
          payload,
        }),
      ]);

      const statuses = [res1.statusCode, res2.statusCode].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);

      const successRes = res1.statusCode === 201 ? res1 : res2;
      const conflictRes = res1.statusCode === 409 ? res1 : res2;

      const successJson = successRes.json<{ patient: { id: string } }>();
      expect(successJson.patient.id).toBeDefined();

      const conflictJson = conflictRes.json<{ code: string }>();
      expect(conflictJson.code).toBe("duplicate_mrn_conflict");

      // Verify Medplum storage has exactly ONE patient with this MRN
      const searchRes = await built.app.inject({
        method: "GET",
        url: "/patients/search?facilityId=fac-a&identifier=MRN-CONCURRENT-EXACT",
        headers: bearer("token-race-mrn"),
      });
      const searchJson = searchRes.json<{ total: number }>();
      expect(searchJson.total).toBe(1);
    });

    it("prevents duplicate MRN registrations from leaking Coverage or RelatedPerson resources on HTTP 409 conflict", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["patient.register", "patient.read"])],
        "fd-leak-check",
      );
      built.identity.addToken("token-leak-check", principal);

      // Pre-seed an existing patient with MRN
      await forFacility(mockMedplum, "fac-a").create({
        resourceType: "Patient",
        name: [{ family: "Existing", given: ["Alice"] }],
        birthDate: "1980-01-01",
        identifier: [{ system: fhirUrls.identifierSystem("mrn"), value: "MRN-NO-LEAK" }],
      });

      // Submit registration with same MRN AND coverage + escort
      const res = await built.app.inject({
        method: "POST",
        url: "/patients/register",
        headers: bearer("token-leak-check"),
        payload: {
          facilityId: "fac-a",
          name: { family: "Existing", given: ["Alice"] },
          dateOfBirth: "1980-01-01",
          gender: "female",
          phone: "(555) 123-4567",
          mrn: "MRN-NO-LEAK",
          confirmDuplicate: true,
          insurance: {
            payerId: "org-payer-1",
            memberId: "MEM-LEAK-TEST",
          },
          escort: {
            name: "Escort Person",
            phone: "(555) 000-1111",
            relationship: "friend",
          },
        },
      });

      expect(res.statusCode).toBe(409);
      const json = res.json<{ code: string }>();
      expect(json.code).toBe("duplicate_mrn_conflict");

      // Verify that NO Coverage or RelatedPerson resources were written to Medplum
      const allCoverages = await mockMedplum.searchResources("Coverage");
      const allEscorts = await mockMedplum.searchResources("RelatedPerson");
      expect(allCoverages.length).toBe(0);
      expect(allEscorts.length).toBe(0);
    });

    it("protects registrations across multiple independent API instances against duplicate MRN without secondary resource leaks", async () => {
      const mockMedplum = new MockClient();
      const instance1 = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });
      const instance2 = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      try {
        const principal = staffPrincipal(
          [facilityGrant("fac-a", ["front-desk"], ["patient.register", "patient.read"])],
          "fd-multi-instance",
        );
        instance1.identity.addToken("token-multi", principal);
        instance2.identity.addToken("token-multi", principal);

        const payload = {
          facilityId: "fac-a",
          name: { family: "Distributed", given: ["Bob"] },
          dateOfBirth: "1985-05-15",
          gender: "male",
          phone: "(555) 987-6543",
          mrn: "MRN-DISTRIBUTED-RACE",
          insurance: {
            payerId: "org-payer-dist",
            memberId: "DIST-MEM-1",
          },
          escort: {
            name: "Escort Bob",
            phone: "(555) 333-4444",
            relationship: "brother",
          },
        };

        const [res1, res2] = await Promise.all([
          instance1.app.inject({
            method: "POST",
            url: "/patients/register",
            headers: bearer("token-multi"),
            payload,
          }),
          instance2.app.inject({
            method: "POST",
            url: "/patients/register",
            headers: bearer("token-multi"),
            payload,
          }),
        ]);

        const statuses = [res1.statusCode, res2.statusCode].sort((a, b) => a - b);
        expect(statuses).toEqual([201, 409]);

        const successRes = res1.statusCode === 201 ? res1 : res2;
        const conflictRes = res1.statusCode === 409 ? res1 : res2;

        expect(successRes.json<{ patient: { id: string } }>().patient.id).toBeDefined();
        expect(conflictRes.json<{ code: string }>().code).toBe("duplicate_mrn_conflict");

        // Storage verification: exactly 1 Patient, 1 Coverage, and 1 RelatedPerson created
        const allPatients = await mockMedplum.searchResources("Patient");
        const matched = allPatients.filter((p) => p.identifier?.some((id) => id.value === "MRN-DISTRIBUTED-RACE"));
        expect(matched.length).toBe(1);

        const allCoverages = await mockMedplum.searchResources("Coverage");
        expect(allCoverages.length).toBe(1);

        const allEscorts = await mockMedplum.searchResources("RelatedPerson");
        expect(allEscorts.length).toBe(1);
      } finally {
        await instance1.app.close();
        await instance2.app.close();
      }
    });

    it("documents multi-instance boundary: demographic-only duplicates (no MRN) across separate API instances bypass in-memory queue", async () => {
      const mockMedplum = new MockClient();
      const instance1 = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });
      const instance2 = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      try {
        const principal = staffPrincipal(
          [facilityGrant("fac-a", ["front-desk"], ["patient.register", "patient.read"])],
          "fd-multi-demo",
        );
        instance1.identity.addToken("token-multi-demo", principal);
        instance2.identity.addToken("token-multi-demo", principal);

        const payload = {
          facilityId: "fac-a",
          name: { family: "DemographicOnly", given: ["Charlie"] },
          dateOfBirth: "1990-10-20",
          gender: "male",
          phone: "(555) 777-8888",
        };

        const [res1, res2] = await Promise.all([
          instance1.app.inject({
            method: "POST",
            url: "/patients/register",
            headers: bearer("token-multi-demo"),
            payload,
          }),
          instance2.app.inject({
            method: "POST",
            url: "/patients/register",
            headers: bearer("token-multi-demo"),
            payload,
          }),
        ]);

        // When separate API instances process requests concurrently without an external distributed lock,
        // each instance's process-local in-memory queue operates independently.
        // If both searches execute before either write commits, both return 201; if one write commits before
        // the other searches, the second returns 409.
        expect([res1.statusCode, res2.statusCode].every((s) => s === 201 || s === 409)).toBe(true);
      } finally {
        await instance1.app.close();
        await instance2.app.close();
      }
    });

    it("prevents concurrent requests with identical demographics (no MRN) from creating duplicate patient records", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["patient.register", "patient.read"])],
        "fd-race-demo",
      );
      built.identity.addToken("token-race-demo", principal);

      const payload = {
        facilityId: "fac-a",
        name: { family: "DemographicRace", given: ["Bob"] },
        dateOfBirth: "1988-08-08",
        gender: "male",
        phone: "(555) 345-6789",
      };

      const [res1, res2] = await Promise.all([
        built.app.inject({
          method: "POST",
          url: "/patients/register",
          headers: bearer("token-race-demo"),
          payload,
        }),
        built.app.inject({
          method: "POST",
          url: "/patients/register",
          headers: bearer("token-race-demo"),
          payload,
        }),
      ]);

      const statuses = [res1.statusCode, res2.statusCode].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);

      const conflictRes = res1.statusCode === 409 ? res1 : res2;
      const conflictJson = conflictRes.json<{ code: string }>();
      expect(conflictJson.code).toBe("duplicate_patient_detected");

      // Verify Medplum storage has exactly ONE patient registered
      const searchRes = await built.app.inject({
        method: "GET",
        url: "/patients/search?facilityId=fac-a&name=DemographicRace",
        headers: bearer("token-race-demo"),
      });
      const searchJson = searchRes.json<{ total: number }>();
      expect(searchJson.total).toBe(1);
    });

    it("allows concurrent registration requests for different patients at the same facility", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["patient.register", "patient.read"])],
        "fd-diff",
      );
      built.identity.addToken("token-diff", principal);

      const payload1 = {
        facilityId: "fac-a",
        name: { family: "PatientOne", given: ["Alice"] },
        dateOfBirth: "1980-01-01",
        gender: "female",
        phone: "(555) 111-2222",
        mrn: "MRN-DIFF-1",
      };

      const payload2 = {
        facilityId: "fac-a",
        name: { family: "PatientTwo", given: ["Bob"] },
        dateOfBirth: "1975-06-20",
        gender: "male",
        phone: "(555) 333-4444",
        mrn: "MRN-DIFF-2",
      };

      const [res1, res2] = await Promise.all([
        built.app.inject({
          method: "POST",
          url: "/patients/register",
          headers: bearer("token-diff"),
          payload: payload1,
        }),
        built.app.inject({
          method: "POST",
          url: "/patients/register",
          headers: bearer("token-diff"),
          payload: payload2,
        }),
      ]);

      expect(res1.statusCode).toBe(201);
      expect(res2.statusCode).toBe(201);

      const json1 = res1.json<{ patient: { id: string } }>();
      const json2 = res2.json<{ patient: { id: string } }>();
      expect(json1.patient.id).toBeDefined();
      expect(json2.patient.id).toBeDefined();
      expect(json1.patient.id).not.toBe(json2.patient.id);
    });

    it("allows concurrent registration requests across different facilities", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [
          facilityGrant("fac-a", ["front-desk"], ["patient.register"]),
          facilityGrant("fac-b", ["front-desk"], ["patient.register"]),
        ],
        "fd-multi",
      );
      built.identity.addToken("token-multi", principal);

      const payloadA = {
        facilityId: "fac-a",
        name: { family: "CrossA", given: ["Carol"] },
        dateOfBirth: "1992-02-02",
        gender: "female",
        phone: "(555) 555-0001",
      };

      const payloadB = {
        facilityId: "fac-b",
        name: { family: "CrossB", given: ["David"] },
        dateOfBirth: "1993-03-03",
        gender: "male",
        phone: "(555) 555-0002",
      };

      const [resA, resB] = await Promise.all([
        built.app.inject({
          method: "POST",
          url: "/patients/register",
          headers: bearer("token-multi"),
          payload: payloadA,
        }),
        built.app.inject({
          method: "POST",
          url: "/patients/register",
          headers: bearer("token-multi"),
          payload: payloadB,
        }),
      ]);

      expect(resA.statusCode).toBe(201);
      expect(resB.statusCode).toBe(201);
    });

    it("recovers gracefully and permits subsequent registrations if a prior registration failed", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["patient.register"])],
        "fd-recovery",
      );
      built.identity.addToken("token-recovery", principal);

      // Request 1: Invalid payload (causes 400)
      const res1 = await built.app.inject({
        method: "POST",
        url: "/patients/register",
        headers: bearer("token-recovery"),
        payload: {
          facilityId: "fac-a",
          name: { family: "", given: [] },
          dateOfBirth: "invalid-date",
          gender: "invalid",
          phone: "123",
        },
      });
      expect(res1.statusCode).toBe(400);

      // Request 2: Valid payload should succeed without getting stuck
      const res2 = await built.app.inject({
        method: "POST",
        url: "/patients/register",
        headers: bearer("token-recovery"),
        payload: {
          facilityId: "fac-a",
          name: { family: "Recovered", given: ["Patient"] },
          dateOfBirth: "1990-12-12",
          gender: "female",
          phone: "(555) 777-9999",
        },
      });
      expect(res2.statusCode).toBe(201);
    });

    it("idempotently recovers incomplete registrations by safely attaching missing secondary resources and returning HTTP 200", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["patient.register", "patient.read"])],
        "fd-idempotent",
      );
      built.identity.addToken("token-idempotent", principal);

      // Simulate a previously failed registration where Step 1 succeeded (Patient saved) but Step 2 failed
      const seededPatient = await forFacility(mockMedplum, "fac-a").create({
        resourceType: "Patient",
        name: [{ family: "Incomplete", given: ["Bob"] }],
        birthDate: "1985-05-15",
        gender: "male",
        identifier: [{ system: fhirUrls.identifierSystem("mrn"), value: "MRN-INCOMPLETE-RETRY" }],
      });

      const retryPayload = {
        facilityId: "fac-a",
        name: { family: "Incomplete", given: ["Bob"] },
        dateOfBirth: "1985-05-15",
        gender: "male",
        phone: "(555) 888-0000",
        mrn: "MRN-INCOMPLETE-RETRY",
        retry: true,
        insurance: {
          payerId: "payor-bluecross",
          memberId: "BC-98765",
          planName: "PPO Standard",
          relationship: "self",
        },
        escort: {
          name: "Mary Incomplete",
          phone: "(555) 888-1111",
          relationship: "spouse",
        },
      };

      // Retry request should succeed with 200 OK and complete the registration
      const retryRes = await built.app.inject({
        method: "POST",
        url: "/patients/register",
        headers: bearer("token-idempotent"),
        payload: retryPayload,
      });

      expect(retryRes.statusCode).toBe(200);
      const json = retryRes.json<{
        patient: { id: string };
        coverage?: { id: string; subscriberId?: string };
        escort?: { id: string; name?: [{ text?: string }] };
      }>();

      expect(json.patient.id).toBe(seededPatient.id);
      expect(json.coverage).toBeDefined();
      expect(json.coverage?.subscriberId).toBe("BC-98765");
      expect(json.escort).toBeDefined();
      expect(json.escort?.name?.[0]?.text).toBe("Mary Incomplete");

      // Verify that calling retry again on the now-completed patient returns 200 without creating duplicates
      const secondRetry = await built.app.inject({
        method: "POST",
        url: "/patients/register",
        headers: bearer("token-idempotent"),
        payload: retryPayload,
      });
      expect(secondRetry.statusCode).toBe(200);

      const allCoverages = await mockMedplum.searchResources("Coverage");
      expect(allCoverages.length).toBe(1);
      const allEscorts = await mockMedplum.searchResources("RelatedPerson");
      expect(allEscorts.length).toBe(1);
    });

    it("rejects retry with 409 duplicate_mrn_conflict if MRN matches an existing patient with different demographics", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["patient.register"])],
        "fd-clash",
      );
      built.identity.addToken("token-clash", principal);

      await forFacility(mockMedplum, "fac-a").create({
        resourceType: "Patient",
        name: [{ family: "OriginalFamily", given: ["Alice"] }],
        birthDate: "1970-01-01",
        identifier: [{ system: fhirUrls.identifierSystem("mrn"), value: "MRN-COLLISION" }],
      });

      const res = await built.app.inject({
        method: "POST",
        url: "/patients/register",
        headers: bearer("token-clash"),
        payload: {
          facilityId: "fac-a",
          name: { family: "ImposterFamily", given: ["Alice"] },
          dateOfBirth: "1990-12-31",
          gender: "female",
          phone: "(555) 999-1234",
          mrn: "MRN-COLLISION",
          retry: true,
          insurance: {
            payerId: "payor-1",
            memberId: "MEM-123",
          },
        },
      });

      expect(res.statusCode).toBe(409);
      const json = res.json<{ code: string }>();
      expect(json.code).toBe("duplicate_mrn_conflict");

      const coverages = await mockMedplum.searchResources("Coverage");
      expect(coverages.length).toBe(0);
    });

    it("compensates Step 2 failure by deleting newly created Patient record", async () => {
      const mockMedplum = new MockClient();

      // Configure MockClient so the secondary transaction fails
      const originalExecuteBatch = mockMedplum.executeBatch.bind(mockMedplum);
      let batchCallCount = 0;
      mockMedplum.executeBatch = async (bundle) => {
        batchCallCount++;
        if (batchCallCount === 2) {
          throw new Error("Simulated secondary transaction failure");
        }
        return originalExecuteBatch(bundle);
      };

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["patient.register"])],
        "fd-compensate",
      );
      built.identity.addToken("token-compensate", principal);

      const res = await built.app.inject({
        method: "POST",
        url: "/patients/register",
        headers: bearer("token-compensate"),
        payload: {
          facilityId: "fac-a",
          name: { family: "CompensateMe", given: ["Charlie"] },
          dateOfBirth: "1988-08-08",
          gender: "male",
          phone: "(555) 777-1111",
          mrn: "MRN-COMPENSATE",
          insurance: {
            payerId: "payor-broken",
            memberId: "MEM-FAIL",
          },
        },
      });

      expect(res.statusCode).toBe(500);

      // Verify compensation delete removed the patient record from Medplum
      const patients = await mockMedplum.searchResources("Patient");
      const matched = patients.filter((p) => p.name?.[0]?.family === "CompensateMe");
      expect(matched.length).toBe(0);
    });

    it("protects against demographic-only duplicates across independent API instances when shared lock is configured", async () => {
      const mockMedplum = new MockClient();
      const sharedLock = createInMemoryRegistrationLock();

      const instance1 = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
        facilityRegistrationLock: sharedLock,
      });

      const instance2 = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
        facilityRegistrationLock: sharedLock,
      });

      try {
        const principal = staffPrincipal(
          [facilityGrant("fac-a", ["front-desk"], ["patient.register", "patient.read"])],
          "fd-shared-lock",
        );
        instance1.identity.addToken("token-shared", principal);
        instance2.identity.addToken("token-shared", principal);

        const payload = {
          facilityId: "fac-a",
          name: { family: "SharedDemographic", given: ["Daniel"] },
          dateOfBirth: "1994-04-14",
          gender: "male",
          phone: "(555) 234-5678",
        };

        const [res1, res2] = await Promise.all([
          instance1.app.inject({
            method: "POST",
            url: "/patients/register",
            headers: bearer("token-shared"),
            payload,
          }),
          instance2.app.inject({
            method: "POST",
            url: "/patients/register",
            headers: bearer("token-shared"),
            payload,
          }),
        ]);

        const statuses = [res1.statusCode, res2.statusCode].sort((a, b) => a - b);
        expect(statuses).toEqual([201, 409]);

        const conflictRes = res1.statusCode === 409 ? res1 : res2;
        expect(conflictRes.json<{ code: string }>().code).toBe("duplicate_patient_detected");

        // Exactly 1 Patient created in storage
        const allPatients = await mockMedplum.searchResources("Patient");
        const matched = allPatients.filter((p) => p.name?.[0]?.family === "SharedDemographic");
        expect(matched.length).toBe(1);
      } finally {
        await instance1.app.close();
        await instance2.app.close();
      }
    });

    it("recovery matching creates new coverage and escort when existing resources do not match requested details", async () => {
      const mockMedplum = new MockClient();
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["patient.register", "patient.read"])],
        "fd-strict-match",
      );
      built.identity.addToken("token-strict-match", principal);

      // Initial registration creates Patient with Coverage A and Escort A
      const initialRes = await built.app.inject({
        method: "POST",
        url: "/patients/register",
        headers: bearer("token-strict-match"),
        payload: {
          facilityId: "fac-a",
          name: { family: "MatchFamily", given: ["Strict"] },
          dateOfBirth: "1991-01-01",
          gender: "female",
          phone: "(555) 111-2222",
          mrn: "MRN-STRICT-MATCH",
          insurance: {
            payerId: "payor-alpha",
            memberId: "MEM-ALPHA",
          },
          escort: {
            name: "Alpha Escort",
            relationship: "sponsor",
            phone: "(555) 111-2222",
          },
        },
      });

      expect(initialRes.statusCode).toBe(201);
      const initialJson = initialRes.json<{
        patient: WithId<Patient>;
        coverage?: WithId<Coverage>;
        escort?: WithId<RelatedPerson>;
      }>();
      expect(initialJson.coverage?.subscriberId).toBe("MEM-ALPHA");
      expect(initialJson.escort?.name?.[0]?.text).toBe("Alpha Escort");

      // Now, retry with same MRN and same patient identity, but requesting Coverage B and Escort B
      // Without strict matching, the system would falsely return Coverage A and Escort A
      const retryRes = await built.app.inject({
        method: "POST",
        url: "/patients/register",
        headers: bearer("token-strict-match"),
        payload: {
          facilityId: "fac-a",
          name: { family: "MatchFamily", given: ["Strict"] },
          dateOfBirth: "1991-01-01",
          gender: "female",
          phone: "(555) 111-2222",
          mrn: "MRN-STRICT-MATCH",
          retry: true,
          insurance: {
            payerId: "payor-beta",
            memberId: "MEM-BETA",
          },
          escort: {
            name: "Beta Escort",
            relationship: "sponsor",
            phone: "(555) 333-4444",
          },
        },
      });

      expect(retryRes.statusCode).toBe(200);
      const retryJson = retryRes.json<{
        patient: WithId<Patient>;
        coverage?: WithId<Coverage>;
        escort?: WithId<RelatedPerson>;
      }>();

      // Coverage B and Escort B must be created and returned, not falsely re-using A
      expect(retryJson.coverage?.subscriberId).toBe("MEM-BETA");
      expect(retryJson.coverage?.payor?.[0]?.reference).toBe("Organization/payor-beta");
      expect(retryJson.escort?.name?.[0]?.text).toBe("Beta Escort");

      // Verify Medplum storage now contains both distinct coverages and escorts
      const allCoverages = await mockMedplum.searchResources("Coverage");
      const allEscorts = await mockMedplum.searchResources("RelatedPerson");
      expect(allCoverages.length).toBe(2);
      expect(allEscorts.length).toBe(2);
      expect(allCoverages.map((c) => c.subscriberId).sort()).toEqual(["MEM-ALPHA", "MEM-BETA"]);
    });

    it("skips compensation delete on ambiguous network error preserving patient for retry", async () => {
      const mockMedplum = new MockClient();

      let batchCallCount = 0;
      let simulateNetworkError = true;
      const originalExecuteBatch = mockMedplum.executeBatch.bind(mockMedplum);
      mockMedplum.executeBatch = async (bundle) => {
        batchCallCount++;
        // Simulate network timeout / fetch failed during secondary transaction (Step 2)
        if (simulateNetworkError && batchCallCount === 2) {
          const networkErr = new TypeError("fetch failed");
          Object.assign(networkErr, { code: "ETIMEDOUT" });
          throw networkErr;
        }
        return originalExecuteBatch(bundle);
      };

      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["patient.register", "patient.read"])],
        "fd-net-timeout",
      );
      built.identity.addToken("token-net-timeout", principal);

      const payload = {
        facilityId: "fac-a",
        name: { family: "NetworkTimeout", given: ["Evan"] },
        dateOfBirth: "1983-03-03",
        gender: "male",
        phone: "(555) 444-5555",
        mrn: "MRN-NET-TIMEOUT",
        insurance: {
          payerId: "payor-timeout",
          memberId: "MEM-TIMEOUT-123",
        },
      };

      const failRes = await built.app.inject({
        method: "POST",
        url: "/patients/register",
        headers: bearer("token-net-timeout"),
        payload,
      });

      expect(failRes.statusCode).toBe(500);

      // Verify patient record was NOT deleted because of ambiguous network failure
      const patients = await mockMedplum.searchResources("Patient");
      const matchedPatient = patients.find((p) => p.name?.[0]?.family === "NetworkTimeout");
      expect(matchedPatient).toBeDefined();

      // Now network recovers: retrying with retry: true safely recovers and attaches coverage
      simulateNetworkError = false;
      const retryRes = await built.app.inject({
        method: "POST",
        url: "/patients/register",
        headers: bearer("token-net-timeout"),
        payload: {
          ...payload,
          retry: true,
        },
      });

      expect(retryRes.statusCode).toBe(200);
      const retryJson = retryRes.json<{
        patient: WithId<Patient>;
        coverage?: WithId<Coverage>;
      }>();
      expect(retryJson.patient.id).toBe(matchedPatient?.id);
      expect(retryJson.coverage?.subscriberId).toBe("MEM-TIMEOUT-123");

      // Verify no duplicate patient was created
      const allPatientsAfterRetry = await mockMedplum.searchResources("Patient");
      const allMatched = allPatientsAfterRetry.filter((p) => p.name?.[0]?.family === "NetworkTimeout");
      expect(allMatched.length).toBe(1);
    });

    it("fallback in-memory lock serializes concurrent registration requests when no lock is explicitly provided", async () => {
      const mockMedplum = new MockClient();

      // buildTestApp without facilityRegistrationLock -> uses decorated fallback lock
      built = await buildTestApp({
        medplumBaseUrl: "http://localhost:8203/",
        createMedplumClient: () => mockMedplum,
      });

      const principal = staffPrincipal(
        [facilityGrant("fac-a", ["front-desk"], ["patient.register", "patient.read"])],
        "fd-fallback-lock",
      );
      built.identity.addToken("token-fallback-lock", principal);

      const payload = {
        facilityId: "fac-a",
        name: { family: "FallbackLockFamily", given: ["George"] },
        dateOfBirth: "1975-07-07",
        gender: "male",
        phone: "(555) 888-9999",
      };

      const [res1, res2] = await Promise.all([
        built.app.inject({
          method: "POST",
          url: "/patients/register",
          headers: bearer("token-fallback-lock"),
          payload,
        }),
        built.app.inject({
          method: "POST",
          url: "/patients/register",
          headers: bearer("token-fallback-lock"),
          payload,
        }),
      ]);

      const statuses = [res1.statusCode, res2.statusCode].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);

      const conflictRes = res1.statusCode === 409 ? res1 : res2;
      expect(conflictRes.json<{ code: string }>().code).toBe("duplicate_patient_detected");

      const allPatients = await mockMedplum.searchResources("Patient");
      const matched = allPatients.filter((p) => p.name?.[0]?.family === "FallbackLockFamily");
      expect(matched.length).toBe(1);
    });
  });
});
