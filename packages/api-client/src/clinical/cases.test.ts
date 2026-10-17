import { afterEach, describe, expect, it, vi } from "vitest";
import type { BookCaseInput } from "@asc/validation/cases/book";
import { ApiError } from "../http";
import {
  assignScope,
  bookCase,
  getCase,
  getSchedule,
  overrideGate2,
  recordProcedureEvent,
  signTimeOut,
  submitPreAnesthesiaAssessment,
  syncAimsBatch,
  transitionCase,
} from "./cases";

function stubFetch(response: Response | Error) {
  const fn = vi.fn((_input: string, _init?: RequestInit) =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response.clone()),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bookCase", () => {
  const validPayload: BookCaseInput = {
    facilityId: "fac-1",
    patientId: "pat-101",
    roomId: "room-1",
    scheduledAt: "2026-10-15T09:00:00Z",
    durationMinutes: 45,
    primaryPhysicianId: "doc-smith",
    anesthesiologistId: "anes-jones",
    procedureIntent: "screening",
    primaryProcedureCode: "45378",
    notes: "Routine screening colonoscopy",
  };

  it("posts to /cases and returns BookCaseResult", async () => {
    const mockResult = {
      caseId: "enc-101",
      appointmentId: "app-101",
      encounterId: "enc-101",
      scheduledAt: "2026-10-15T09:00:00Z",
      roomId: "room-1",
    };
    const fetchMock = stubFetch(Response.json(mockResult, { status: 201 }));

    const res = await bookCase(validPayload);
    expect(res).toEqual(mockResult);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/cases");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify(validPayload));
  });

  it("propagates ApiError with structured conflict reasons on HTTP 409", async () => {
    const errorBody = {
      code: "conflict",
      message: "Operating room is already occupied during this time window",
      details: {
        ROOM_DOUBLE_BOOKED: "Operating room is already occupied during this time window",
      },
      reasons: [
        {
          code: "ROOM_DOUBLE_BOOKED",
          message: "Operating room is already occupied during this time window",
        },
      ],
    };
    stubFetch(Response.json(errorBody, { status: 409 }));

    try {
      await bookCase(validPayload);
      expect.fail("Should have rejected with ApiError");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(409);
      expect(apiErr.code).toBe("conflict");
      expect(apiErr.message).toBe("Operating room is already occupied during this time window");
      expect(apiErr.details).toEqual({
        ROOM_DOUBLE_BOOKED: "Operating room is already occupied during this time window",
      });
      expect(apiErr.reasons).toEqual([
        {
          code: "ROOM_DOUBLE_BOOKED",
          message: "Operating room is already occupied during this time window",
        },
      ]);
    }
  });

  it("passes facilityId as query parameter and header to getSchedule when provided", async () => {
    const fetchMock = stubFetch(Response.json({ date: "2026-10-15", rooms: [], cases: [] }));
    await getSchedule("2026-10-15", "fac-101");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/schedule?date=2026-10-15&facilityId=fac-101");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "x-facility-id": "fac-101",
    });
  });

  it("passes facilityId as query parameter and header to getCase when provided", async () => {
    const fetchMock = stubFetch(Response.json({ case: { id: "c-1" } }));
    await getCase("c-1", "fac-101");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/cases/c-1?facilityId=fac-101");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "x-facility-id": "fac-101",
    });
  });

  it("passes facilityId as query parameter and header to transitionCase when provided", async () => {
    const fetchMock = stubFetch(Response.json({ case: { id: "c-1", phase: "ARRIVED" } }));
    await transitionCase("c-1", { to: "ARRIVED" }, "fac-101");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/cases/c-1/transition?facilityId=fac-101");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "x-facility-id": "fac-101",
    });
  });

  it("posts to /cases/:id/events with facility header and query", async () => {
    const fetchMock = stubFetch(Response.json({ case: { id: "c-1" } }));
    await recordProcedureEvent("c-1", { type: "SCOPE_IN", recordedAt: "2026-10-15T09:10:00Z" }, "fac-101");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/cases/c-1/events?facilityId=fac-101");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ "x-facility-id": "fac-101" });
  });

  it("posts to /cases/:id/time-out with checklist attestation", async () => {
    const fetchMock = stubFetch(Response.json({ case: { id: "c-1" } }));
    await signTimeOut("c-1", {
      role: "SURGEON",
      checklist: {
        patientIdentity: true,
        procedureConfirmed: true,
        consentVerified: true,
        allergiesReviewed: true,
        equipmentReady: true,
        anticoagulationReviewed: true,
        siteAndLateralityConfirmed: true,
        prophylaxisReviewed: true,
        anticipatedIssuesReviewed: true,
      },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/cases/c-1/time-out");
  });

  it("posts to /cases/:id/scope and /cases/:id/gate2-override", async () => {
    const fetchMock = stubFetch(Response.json({ case: { id: "c-1" } }));
    await assignScope("c-1", {
      scopeSerial: "SN-9001",
      scopeModel: "CF-H190L",
      reprocessedAt: "2026-10-14T10:00:00Z",
      leakTestResult: "PASS",
      cycleOutcome: "PASS",
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/cases/c-1/scope");

    await overrideGate2("c-1", {
      reason: "Clinical emergency requires immediate start despite unconfirmed ride",
      actorName: "Dr. Smith",
      actorRole: "SURGEON",
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://localhost:4000/cases/c-1/gate2-override");
  });

  it("posts to /cases/:id/anesthesia/pre-assessment and /cases/:id/aims/batch", async () => {
    const preAssessment = {
      asaClass: 2 as const,
      mallampati: 2 as const,
      airwayNotes: "Normal airway",
      lastOralIntakeIso: "2026-10-15T00:00:00Z",
      npoStatusSatisfied: true,
      assessedAt: "2026-10-15T08:00:00Z",
      assessedBy: { id: "doc-1", name: "Dr. Anes", initials: "DA" },
    };
    const fetchMock = stubFetch(Response.json(preAssessment));

    const res = await submitPreAnesthesiaAssessment("c-1", preAssessment, "fac-1");
    expect(res).toEqual(preAssessment);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/cases/c-1/anesthesia/pre-assessment?facilityId=fac-1");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({ "x-facility-id": "fac-1" }),
    );

    const batchMock = stubFetch(Response.json({ syncedCount: 1, duplicateCount: 0 }));
    const batchRes = await syncAimsBatch(
      "c-1",
      [
        {
          clientId: "uuid-1",
          caseId: "c-1",
          payload: { kind: "dose", drug: "propofol", amount: 50, unit: "mg" },
          recordedAt: "2026-10-15T08:15:00Z",
        },
      ],
      "fac-1",
    );
    expect(batchRes).toEqual({ syncedCount: 1, duplicateCount: 0 });
    expect(batchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/cases/c-1/aims/batch?facilityId=fac-1");
  });
});

