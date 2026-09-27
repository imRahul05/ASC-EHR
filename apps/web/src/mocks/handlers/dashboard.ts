import { API_ROUTE_PATTERNS, API_ROUTES } from "@asc/config/api";
import type { DashboardDataResponse, GICase, UpdateCaseStatusPayload, UserRole } from "@asc/types";
import { userRoleSchema } from "@asc/validation/auth";
import { delay, http, HttpResponse } from "msw";
import { MOCK_GI_CASES } from "../data/cases";
import { MOCK_AUDIT_LOGS, MOCK_METRIC_SUMMARY } from "../data/metrics";
import { apiUrl } from "./api-url";

/** Which demo cases each role's dashboard shows — data, not an if/else chain. */
const CASE_FILTERS: Record<UserRole, (item: GICase) => boolean> = {
  SURGEON: (item) => item.primarySurgeonId === "usr_surgeon_01" || item.status === "IN_PROCEDURE",
  ANESTHESIOLOGIST: (item) => ["PRE_OP", "IN_PROCEDURE", "PACU"].includes(item.status),
  NURSE: () => true,
  ADMIN: () => true,
  PATIENT: (item) => item.mrn === "MRN-83921",
};

export const dashboardHandlers = [
  http.get(apiUrl(API_ROUTES.dashboard), async ({ request }) => {
    await delay(120);
    const role = userRoleSchema.safeParse(new URL(request.url).searchParams.get("role"));
    if (!role.success) return HttpResponse.json({ message: "Unknown role", code: "ROLE_INVALID" }, { status: 400 });
    const body: DashboardDataResponse = {
      metrics: MOCK_METRIC_SUMMARY,
      cases: MOCK_GI_CASES.filter(CASE_FILTERS[role.data]),
      auditLogs: MOCK_AUDIT_LOGS,
      userRole: role.data,
    };
    return HttpResponse.json(body);
  }),

  http.patch(apiUrl(API_ROUTE_PATTERNS.caseStatus), async ({ params, request }) => {
    await delay(100);
    const { status } = (await request.json()) as UpdateCaseStatusPayload;
    const target = MOCK_GI_CASES.find((item) => item.id === params.caseId);
    if (!target) return HttpResponse.json({ message: "Case not found", code: "CASE_NOT_FOUND" }, { status: 404 });
    return HttpResponse.json({ ...target, status });
  }),
];
