import { afterEach, describe, expect, it, vi } from "vitest";
import type { BookCaseInput } from "@asc/validation/cases/book";
import { ApiError } from "../http";
import { bookCase, getCase, getSchedule, transitionCase } from "./cases";

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
});
