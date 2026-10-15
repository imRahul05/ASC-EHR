import { afterEach, describe, expect, it, vi } from "vitest";
import type { SignConsentInput } from "@asc/validation/consent";
import type { PreopAssessmentInput } from "@asc/validation/preop";
import { getConsent, signConsent, submitPreopAssessment } from "./cases";

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

describe("Consent and Pre-op API Client methods", () => {
  const validConsentInput: SignConsentInput = {
    caseId: "case-123",
    procedureName: "Colonoscopy with Polypectomy",
    procedureCode: "45385",
    performingPhysicianName: "Dr. Jane Smith",
    signerName: "John Doe",
    signerRelationship: "patient",
    signatureDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    consentFormVersion: "2026.1",
    risksAcknowledged: true,
    facilityId: "facility-main",
  };

  const validPreopInput: PreopAssessmentInput = {
    caseId: "case-123",
    facilityId: "facility-main",
    vitals: {
      sbp: 120,
      dbp: 80,
      hr: 72,
      rr: 16,
      spo2: 98,
      tempC: 37.0,
    },
    iv: {
      site: "left_forearm",
      gauge: 20,
      attempts: 1,
    },
    npo: {
      solidFoodHoursAgo: 8,
      clearLiquidsHoursAgo: 3,
      confirmed: true,
    },
    escort: {
      name: "Mary Doe",
      relationship: "spouse",
      phone: "555-0199",
      confirmedPresent: true,
    },
    allergiesReviewed: true,
    belongingsSecured: true,
  };

  it("signConsent calls POST /cases/:caseId/consent with facility header and input", async () => {
    const mockResponse = {
      ok: true,
      consent: {
        id: "consent-456",
        caseId: "case-123",
        patientId: "patient-1",
        status: "active",
        procedureName: "Colonoscopy with Polypectomy",
        procedureCode: "45385",
        signerName: "John Doe",
        signerRelationship: "patient",
        signedAt: "2026-10-15T12:00:00Z",
        signatureSha256: "sha256-hash",
        consentFormVersion: "2026.1",
      },
    };
    const fetchMock = stubFetch(Response.json(mockResponse, { status: 200 }));

    const res = await signConsent("case-123", validConsentInput, "facility-main");

    expect(res).toEqual(mockResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("http://localhost:4000/cases/case-123/consent?facilityId=facility-main");
    expect(call?.[1]?.method).toBe("POST");
    expect(call?.[1]?.headers).toMatchObject({
      "x-facility-id": "facility-main",
    });
    expect(call?.[1]?.body).toBe(JSON.stringify(validConsentInput));
  });

  it("getConsent calls GET /cases/:caseId/consent with facility header", async () => {
    const mockConsent = {
      id: "consent-456",
      caseId: "case-123",
      patientId: "patient-1",
      status: "active",
      procedureName: "Colonoscopy with Polypectomy",
      procedureCode: "45385",
      signerName: "John Doe",
      signerRelationship: "patient",
      signedAt: "2026-10-15T12:00:00Z",
      signatureSha256: "sha256-hash",
      consentFormVersion: "2026.1",
    };
    const fetchMock = stubFetch(Response.json(mockConsent, { status: 200 }));

    const res = await getConsent("case-123", "facility-main");

    expect(res).toEqual(mockConsent);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("http://localhost:4000/cases/case-123/consent?facilityId=facility-main");
    expect(call?.[1]?.method).toBe("GET");
    expect(call?.[1]?.headers).toMatchObject({
      "x-facility-id": "facility-main",
    });
  });

  it("submitPreopAssessment calls POST /cases/:caseId/preop-assessment", async () => {
    const mockPreopResponse = {
      ok: true,
      caseId: "case-123",
      vitals: {
        sbp: 120,
        dbp: 80,
        hr: 72,
        rr: 16,
        spo2: 98,
        tempC: 37.0,
      },
    };
    const fetchMock = stubFetch(Response.json(mockPreopResponse, { status: 200 }));

    const res = await submitPreopAssessment("case-123", validPreopInput, "facility-main");

    expect(res).toEqual(mockPreopResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("http://localhost:4000/cases/case-123/preop-assessment?facilityId=facility-main");
    expect(call?.[1]?.method).toBe("POST");
    expect(call?.[1]?.headers).toMatchObject({
      "x-facility-id": "facility-main",
    });
    expect(call?.[1]?.body).toBe(JSON.stringify(validPreopInput));
  });

  it("signConsent falls back to legacy endpoint when SignConsentPayload is provided", async () => {
    const mockCaseDetail = { case: { id: "case-123" } };
    const fetchMock = stubFetch(Response.json(mockCaseDetail, { status: 200 }));

    const res = await signConsent(
      "case-123",
      { consentId: "consent-old", signerName: "John Doe" },
      "facility-main",
    );

    expect(res).toEqual(mockCaseDetail);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("http://localhost:4000/cases/case-123/consents/sign?facilityId=facility-main");
  });
});
