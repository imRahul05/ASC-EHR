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
const post = (url: string, payload: { readonly to: string; readonly reason?: string }) =>
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

  it("GET /cases/:id returns 404 with not_found code when case does not exist", async () => {
    const response = await get(apiUrl(API_ROUTES.case("case_nonexistent")));
    expect(response.status).toBe(404);
    const payload = (await response.json()) as { code: string; message: string };
    expect(payload.code).toBe("not_found");
    expect(payload.message).toContain("case_nonexistent");
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

  it("POST /cases/:id/transition with lowercase CaseStage returns 200 and updates stage and phase", async () => {
    // case_105 starts at CONFIRMED / confirmed
    const response = await post(apiUrl(API_ROUTES.caseTransition("case_105")), {
      to: "arrived",
    });
    expect(response.status).toBe(200);
    const detail = (await response.json()) as CaseDetail;
    expect(detail.case.phase).toBe("ARRIVED");
    expect(detail.case.stage).toBe("arrived");
    expect(detail.case.timestamps.ARRIVED).toBeDefined();
    expect(detail.case.stageTimestamps?.arrived).toBeDefined();

    const stored = db().cases.get("case_105");
    expect(stored?.phase).toBe("ARRIVED");
    expect(stored?.stage).toBe("arrived");
  });

  it("POST /cases/:id/transition with kebab-case stage targets normalizes and updates store", async () => {
    const current = db().cases.get("case_105");
    if (current) {
      db().cases.set("case_105", {
        ...current,
        readinessChecks: [
          { name: "identity", label: "Patient identity", status: "satisfied" },
          { name: "consent", label: "Informed consent", status: "satisfied" },
          { name: "hp", label: "History & physical", status: "satisfied" },
          { name: "anesthesia_clearance", label: "Anesthesia clearance", status: "satisfied" },
          { name: "anticoagulation", label: "Anticoagulation", status: "satisfied" },
          { name: "equipment", label: "Equipment ready", status: "satisfied" },
          { name: "escort", label: "Escort confirmed", status: "satisfied" },
        ],
      });
    }

    // Transition case_105 to arrived first
    await post(apiUrl(API_ROUTES.caseTransition("case_105")), { to: "arrived" });

    // Transition arrived -> pre-op
    const preOpRes = await post(apiUrl(API_ROUTES.caseTransition("case_105")), { to: "pre-op" });
    expect(preOpRes.status).toBe(200);
    const preOpDetail = (await preOpRes.json()) as CaseDetail;
    expect(preOpDetail.case.stage).toBe("preop");
    expect(preOpDetail.case.phase).toBe("PRE_OP");
    expect(preOpDetail.case.stageTimestamps?.preop).toBeDefined();

    // Transition preop -> in-room
    const inRoomRes = await post(apiUrl(API_ROUTES.caseTransition("case_105")), { to: "in-room" });
    expect(inRoomRes.status).toBe(200);
    const inRoomDetail = (await inRoomRes.json()) as CaseDetail;
    expect(inRoomDetail.case.stage).toBe("in_room");
    expect(inRoomDetail.case.phase).toBe("READY_FOR_PROCEDURE");
    expect(inRoomDetail.case.stageTimestamps?.in_room).toBeDefined();
  });

  it("POST /cases/:id/transition with READY_FOR_PROCEDURE maps stage to in_room matching Fastify", async () => {
    const current = db().cases.get("case_105");
    if (current) {
      db().cases.set("case_105", {
        ...current,
        readiness: { ...current.readiness, npoConfirmed: true },
        readinessChecks: [
          { name: "identity", label: "Patient identity", status: "satisfied" },
          { name: "consent", label: "Informed consent", status: "satisfied" },
          { name: "hp", label: "History & physical", status: "satisfied" },
        ],
      });
      const hp = db().hp.get("case_105");
      if (hp) db().hp.set("case_105", { ...hp, status: "signed", asa: 2, holdsReviewed: true });
      const consents = db().consents.get("case_105");
      if (consents) {
        db().consents.set(
          "case_105",
          consents.map((c) => ({ ...c, status: "signed" })),
        );
      }
    }
    await post(apiUrl(API_ROUTES.caseTransition("case_105")), { to: "arrived" });
    await post(apiUrl(API_ROUTES.caseTransition("case_105")), { to: "preop" });
    const response = await post(apiUrl(API_ROUTES.caseTransition("case_105")), { to: "READY_FOR_PROCEDURE" });
    expect(response.status).toBe(200);
    const detail = (await response.json()) as CaseDetail;
    expect(detail.case.stage).toBe("in_room");
    expect(detail.case.phase).toBe("READY_FOR_PROCEDURE");
  });

  it("POST /cases/:id/transition returns 404 with not_found code when case does not exist", async () => {
    const response = await post(apiUrl(API_ROUTES.caseTransition("case_missing")), { to: "ARRIVED" });
    expect(response.status).toBe(404);
    const payload = (await response.json()) as { code: string; message: string };
    expect(payload.code).toBe("not_found");
    expect(payload.message).toContain("case_missing");
  });

  it("POST /cases/:id/transition when transition is disallowed returns 409 with GATE_FAILED code", async () => {
    // case_105 starts at CONFIRMED; jumping directly to DISCHARGED is disallowed
    const response = await post(apiUrl(API_ROUTES.caseTransition("case_105")), {
      to: "DISCHARGED",
    });
    expect(response.status).toBe(409);
    const payload = (await response.json()) as {
      code: string;
      message: string;
      reasons: readonly { code: string; message: string }[];
    };
    expect(payload.code).toBe("GATE_FAILED");
    expect(payload.reasons[0]?.code).toBe("TRANSITION_NOT_ALLOWED");
  });

  it("POST /cases/:id/transition when gate fails returns 409 with GATE_FAILED and reasons array without details", async () => {
    // case_109 is SCHEDULED with inactive eligibility; transitioning to CONFIRMED fails confirmGate
    const response = await post(apiUrl(API_ROUTES.caseTransition("case_109")), {
      to: "CONFIRMED",
    });
    expect(response.status).toBe(409);
    const payload = (await response.json()) as {
      code: string;
      message: string;
      reasons: readonly { code: string; message: string }[];
      details?: Record<string, string>;
    };
    expect(payload.code).toBe("GATE_FAILED");
    expect(payload.message).toBeDefined();
    expect(Array.isArray(payload.reasons)).toBe(true);
    expect(payload.reasons.length).toBeGreaterThan(0);
    expect(payload.reasons[0]?.code).toBe("ELIGIBILITY_ACTIVE");
    expect(payload.details).toBeUndefined();
  });
});
