import { afterEach, describe, expect, it, vi } from "vitest";
import type { HpOverrideInput, HpUpdateNoteInput } from "@asc/validation/hp";
import type { AnticoagulationAssessmentInput } from "@asc/validation/anticoagulation";
import {
  getHpDetail,
  submitAnticoagulation,
  submitHpOverride,
  submitHpUpdate,
} from "./cases";

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

describe("H&P and Anticoagulation API Client methods", () => {
  const validHpUpdateInput: HpUpdateNoteInput = {
    caseId: "case-123",
    facilityId: "facility-main",
    attestation: "Evaluated patient; no interval change in cardiopulmonary status.",
    noIntervalChange: true,
    cardiovascularStatus: "Regular rhythm",
    pulmonaryStatus: "Clear bilaterally",
  };

  const validHpOverrideInput: HpOverrideInput = {
    caseId: "case-123",
    facilityId: "facility-main",
    overrideReason: "Surgeon clinical evaluation cleared for procedure.",
    role: "attending-physician",
  };

  const validAnticoagInput: AnticoagulationAssessmentInput = {
    caseId: "case-123",
    facilityId: "facility-main",
    hasAnticoagulants: true,
    procedureBleedingRisk: "high",
    medications: [
      {
        medicationId: "med-1",
        medicationName: "Eliquis 5mg",
        drugClass: "doac",
        prescriberInstructionDate: "2026-10-10",
        patientConfirmedHeld: true,
      },
    ],
  };

  it("submitHpUpdate calls POST /cases/:caseId/hp-update with facility header and payload", async () => {
    const mockResponse = {
      ok: true,
      documentId: "doc-123",
      readinessChecks: [{ name: "hp", status: "satisfied" }],
    };
    const fetchMock = stubFetch(Response.json(mockResponse, { status: 200 }));

    const res = await submitHpUpdate("case-123", validHpUpdateInput, "facility-main");

    expect(res).toEqual(mockResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("http://localhost:4000/cases/case-123/hp-update?facilityId=facility-main");
    expect(call?.[1]?.method).toBe("POST");
    expect(call?.[1]?.headers).toMatchObject({
      "x-facility-id": "facility-main",
    });
    expect(call?.[1]?.body).toBe(JSON.stringify(validHpUpdateInput));
  });

  it("submitHpOverride calls POST /cases/:caseId/hp-override with facility header and payload", async () => {
    const mockResponse = {
      ok: true,
      readinessChecks: [{ name: "hp", status: "waived" }],
    };
    const fetchMock = stubFetch(Response.json(mockResponse, { status: 200 }));

    const res = await submitHpOverride("case-123", validHpOverrideInput, "facility-main");

    expect(res).toEqual(mockResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("http://localhost:4000/cases/case-123/hp-override?facilityId=facility-main");
    expect(call?.[1]?.method).toBe("POST");
    expect(call?.[1]?.headers).toMatchObject({
      "x-facility-id": "facility-main",
    });
    expect(call?.[1]?.body).toBe(JSON.stringify(validHpOverrideInput));
  });

  it("submitAnticoagulation calls POST /cases/:caseId/anticoagulation with facility header and payload", async () => {
    const mockResponse = {
      ok: true,
      observationId: "obs-123",
      readinessChecks: [{ name: "anticoagulation", status: "satisfied" }],
    };
    const fetchMock = stubFetch(Response.json(mockResponse, { status: 200 }));

    const res = await submitAnticoagulation("case-123", validAnticoagInput, "facility-main");

    expect(res).toEqual(mockResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("http://localhost:4000/cases/case-123/anticoagulation?facilityId=facility-main");
    expect(call?.[1]?.method).toBe("POST");
    expect(call?.[1]?.headers).toMatchObject({
      "x-facility-id": "facility-main",
    });
    expect(call?.[1]?.body).toBe(JSON.stringify(validAnticoagInput));
  });

  it("getHpDetail calls GET /cases/:caseId/hp with facility query and header", async () => {
    const mockResponse = {
      caseId: "case-123",
      status: "satisfied",
      documentedDate: "2026-10-15",
    };
    const fetchMock = stubFetch(Response.json(mockResponse, { status: 200 }));

    const res = await getHpDetail("case-123", "facility-main");

    expect(res).toEqual(mockResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("http://localhost:4000/cases/case-123/hp?facilityId=facility-main");
    expect(call?.[1]?.method).toBe("GET");
    expect(call?.[1]?.headers).toMatchObject({
      "x-facility-id": "facility-main",
    });
  });
});
