import { afterEach, describe, expect, it, vi } from "vitest";
import type { CopayCollection, EligibilityCheckRequest, PriorAuthCheck } from "@asc/validation/financial";
import {
  checkEligibility,
  collectCopay,
  getFinancialSummary,
  recordPriorAuth,
} from "./financial.js";

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

describe("Financial Clearance API Client methods", () => {
  const facilityId = "fac-fin-1";
  const caseId = "case-101";

  it("checkEligibility calls POST /cases/:caseId/eligibility/check with facility headers", async () => {
    const mockResponse = {
      eligibility: { status: "active", planName: "Aetna POS" },
      evaluation: { status: "satisfied", requiresWorkItem: false },
      requestId: "req-1",
      responseId: "res-1",
    };
    const fetchMock = stubFetch(Response.json(mockResponse, { status: 200 }));

    const payload: EligibilityCheckRequest = { caseId, forceRefresh: true, serviceTypeCode: "33" };
    const res = await checkEligibility(caseId, payload, facilityId);

    expect(res).toEqual(mockResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("http://localhost:4000/cases/case-101/eligibility/check?facilityId=fac-fin-1");
    expect(call?.[1]?.method).toBe("POST");
    expect(call?.[1]?.headers).toMatchObject({
      "x-facility-id": facilityId,
    });
    expect(call?.[1]?.body).toBe(JSON.stringify(payload));
  });

  it("getFinancialSummary calls GET /cases/:caseId/financial-summary with facility headers", async () => {
    const mockSummary = {
      caseId,
      eligibilityStatus: "active",
      planName: "Aetna Choice POS II",
      planType: "PPO",
      inNetwork: true,
      deductibleCents: 150000,
      deductibleRemainingCents: 50000,
      copayCents: 0,
      coinsurancePercent: 20,
      outOfPocketMaxCents: 500000,
      outOfPocketRemainingCents: 250000,
      priorAuthStatus: "approved",
      authNumber: "AUTH-12345",
      estimate: {
        estimatedScreeningPatientOwedCents: 0,
        estimatedTherapeuticPatientOwedCents: 30000,
        patientResponsibilityCents: 0,
        preventiveMandateApplies: true,
      },
      collectedCents: 0,
      balanceRemainingCents: 0,
      hasPaymentPlan: false,
      overallStatus: "satisfied",
      isCleared: true,
    };
    const fetchMock = stubFetch(Response.json(mockSummary, { status: 200 }));

    const res = await getFinancialSummary(caseId, facilityId);

    expect(res).toEqual(mockSummary);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("http://localhost:4000/cases/case-101/financial-summary?facilityId=fac-fin-1");
    expect(call?.[1]?.method).toBe("GET");
    expect(call?.[1]?.headers).toMatchObject({
      "x-facility-id": facilityId,
    });
  });

  it("collectCopay calls POST /cases/:caseId/copay-collected with payment details", async () => {
    const mockReceipt = {
      caseId,
      paidCents: 5000,
      totalCollectedCents: 5000,
      paymentMethod: "credit_card",
      transactionRef: "tx_999",
      paymentPlanActive: false,
    };
    const fetchMock = stubFetch(Response.json(mockReceipt, { status: 200 }));

    const payload: CopayCollection = {
      caseId,
      amountCents: 5000,
      paymentMethod: "credit_card",
      transactionRef: "tx_999",
    };
    const res = await collectCopay(caseId, payload, facilityId);

    expect(res).toEqual(mockReceipt);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("http://localhost:4000/cases/case-101/copay-collected?facilityId=fac-fin-1");
    expect(call?.[1]?.method).toBe("POST");
    expect(call?.[1]?.headers).toMatchObject({
      "x-facility-id": facilityId,
    });
    expect(call?.[1]?.body).toBe(JSON.stringify(payload));
  });

  it("recordPriorAuth calls POST /cases/:caseId/prior-auth with auth details", async () => {
    const mockAuthResult = {
      priorAuth: {
        authNumber: "AUTH-88219",
        status: "approved",
        validFrom: "2026-10-01",
        validTo: "2026-10-31",
        approvedCptCodes: ["45378"],
        approvedUnits: 1,
      },
      evaluation: {
        status: "satisfied",
        isExpired: false,
        codeMismatch: false,
      },
    };
    const fetchMock = stubFetch(Response.json(mockAuthResult, { status: 200 }));

    const payload: PriorAuthCheck = {
      authNumber: "AUTH-88219",
      status: "approved",
      validFrom: "2026-10-01",
      validTo: "2026-10-31",
      approvedCptCodes: ["45378"],
      approvedUnits: 1,
    };
    const res = await recordPriorAuth(caseId, payload, facilityId);

    expect(res).toEqual(mockAuthResult);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("http://localhost:4000/cases/case-101/prior-auth?facilityId=fac-fin-1");
    expect(call?.[1]?.method).toBe("POST");
    expect(call?.[1]?.headers).toMatchObject({
      "x-facility-id": facilityId,
    });
    expect(call?.[1]?.body).toBe(JSON.stringify(payload));
  });
});
