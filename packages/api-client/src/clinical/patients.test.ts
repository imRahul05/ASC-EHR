import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../http";
import { registerPatient, searchPatients } from "./patients";

function stubFetch(response: Response | Error) {
  const fn = vi.fn((_input: string, _init?: RequestInit) =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("registerPatient", () => {
  it("posts to /patients/register and returns RegisterPatientResult", async () => {
    const mockResult = {
      patient: { id: "p-123", displayName: "Jane Doe", mrn: "MRN-123" },
      coverage: { id: "cov-123", payerName: "Aetna", status: "active" },
      escort: { id: "esc-123", name: "John Doe", relationship: "Spouse", phone: "555-1234" },
    };
    const fetchMock = stubFetch(Response.json(mockResult, { status: 201 }));

    const payload = {
      facilityId: "fac-1",
      name: { given: ["Jane"], family: "Doe" },
      dateOfBirth: "1985-05-15",
      gender: "female" as const,
      phone: "555-123-4567",
      mrn: "MRN-123",
    };

    const res = await registerPatient(payload);
    expect(res).toEqual(mockResult);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/patients/register");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify(payload));
  });

  it("propagates ApiError with duplicateMatch on 409 conflict", async () => {
    const errorBody = {
      code: "duplicate_mrn_conflict",
      message: "Patient with MRN MRN-123 already exists",
      duplicateMatch: {
        hasMatch: true,
        highestConfidence: "exact_identifier" as const,
        matches: [
          {
            patientId: "p-existing",
            confidence: "exact_identifier" as const,
            score: 1.0,
            reasons: ["Exact MRN match: MRN-123"],
          },
        ],
      },
    };
    stubFetch(Response.json(errorBody, { status: 409 }));

    const payload = {
      facilityId: "fac-1",
      name: { given: ["Jane"], family: "Doe" },
      dateOfBirth: "1985-05-15",
      gender: "female" as const,
      phone: "555-123-4567",
      mrn: "MRN-123",
    };

    const err = await registerPatient(payload).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiError = err as ApiError;
    expect(apiError.status).toBe(409);
    expect(apiError.code).toBe("duplicate_mrn_conflict");
    expect(apiError.duplicateMatch).toEqual(errorBody.duplicateMatch);
  });
});

describe("searchPatients", () => {
  it("posts to /patients/search and normalizes FHIR patient search response", async () => {
    const fhirResponse = {
      total: 1,
      patients: [
        {
          resourceType: "Patient",
          id: "p-999",
          identifier: [{ system: "http://example.com/mrn", value: "MRN-999" }],
          name: [{ family: "Smith", given: ["Alice"] }],
          birthDate: "1990-01-01",
          gender: "female",
          telecom: [{ system: "phone", value: "555-9876" }],
        },
      ],
    };
    const fetchMock = stubFetch(Response.json(fhirResponse, { status: 200 }));

    const results = await searchPatients({ name: "Alice", facilityId: "fac-1" });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("p-999");
    expect(results[0]?.displayName).toBe("Alice Smith");
    expect(results[0]?.mrn).toBe("MRN-999");
    expect(results[0]?.sex).toBe("F");
    expect(results[0]?.phone).toBe("555-9876");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/patients/search");
  });

  it("handles array response of PatientListItem", async () => {
    const listResponse = [
      {
        id: "p-100",
        mrn: "MRN-100",
        displayName: "Bob Jones",
        initials: "BJ",
        age: 45,
        sex: "M" as const,
        dateOfBirth: "1979-04-12",
        phone: "555-1111",
        allergyCount: 1,
      },
    ];
    stubFetch(Response.json(listResponse, { status: 200 }));

    const results = await searchPatients({ mrn: "MRN-100" });
    expect(results).toEqual(listResponse);
  });
});
