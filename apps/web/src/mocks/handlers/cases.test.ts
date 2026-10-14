import { API_ROUTES } from "@asc/config/api";
import type { CaseDetail, ScheduleDay } from "@asc/types";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "../db/store";
import { apiUrl } from "./api-url";
import { caseHandlers } from "./clinical/cases";

const server = setupServer(...caseHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  resetDb();
});

const get = (url: string) => fetch(url);
const post = (url: string, payload: Record<string, string | number | boolean | null | undefined | object>) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

describe("mock clinical case handlers", () => {
  it("GET /schedule with ?facilityId=... returns status 200 with ScheduleDay", async () => {
    const url = `${apiUrl(API_ROUTES.schedule)}?facilityId=fac-metro`;
    const response = await get(url);
    expect(response.status).toBe(200);
    const day = (await response.json()) as ScheduleDay;
    expect(day).toHaveProperty("date");
    expect(day).toHaveProperty("rooms");
    expect(day).toHaveProperty("cases");
    expect(Array.isArray(day.cases)).toBe(true);
  });

  it("GET /cases/:id returns status 200 with hydrated CaseDetail", async () => {
    const response = await get(apiUrl(API_ROUTES.case("case_101")));
    expect(response.status).toBe(200);
    const detail = (await response.json()) as CaseDetail;
    expect(detail.case.id).toBe("case_101");
    expect(detail).toHaveProperty("patient");
    expect(detail).toHaveProperty("summary");
  });

  it("POST /cases/:id/transition with valid target returns 200 and updates both stage and phase", async () => {
    // case_105 starts at CONFIRMED / confirmed
    const response = await post(apiUrl(API_ROUTES.caseTransition("case_105")), {
      to: "ARRIVED",
    });
    expect(response.status).toBe(200);
    const detail = (await response.json()) as CaseDetail;
    expect(detail.case.phase).toBe("ARRIVED");
    expect(detail.case.stage).toBe("arrived");
    expect(detail.case.timestamps.ARRIVED).toBeDefined();
    expect(detail.case.stageTimestamps?.arrived).toBeDefined();

    // Verify persisted in store
    const stored = db().cases.get("case_105");
    expect(stored?.phase).toBe("ARRIVED");
    expect(stored?.stage).toBe("arrived");
    expect(stored?.stageTimestamps?.arrived).toBeDefined();
  });

  it("POST /cases/:id/transition when gate fails returns 409 with GATE_FAILED and reasons array", async () => {
    // case_109 is SCHEDULED with inactive eligibility; transitioning to CONFIRMED fails confirmGate
    const response = await post(apiUrl(API_ROUTES.caseTransition("case_109")), {
      to: "CONFIRMED",
    });
    expect(response.status).toBe(409);
    const payload = (await response.json()) as {
      code: string;
      message: string;
      reasons: readonly { code: string; message: string }[];
    };
    expect(payload.code).toBe("GATE_FAILED");
    expect(payload.message).toBeDefined();
    expect(Array.isArray(payload.reasons)).toBe(true);
    expect(payload.reasons.length).toBeGreaterThan(0);
    expect(payload.reasons[0]?.code).toBe("ELIGIBILITY_ACTIVE");
  });
});
