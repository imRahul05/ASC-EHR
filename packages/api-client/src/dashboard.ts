import { API_ROUTES } from "@asc/config/api";
import type { CaseStatus, DashboardDataResponse, GICase, UpdateCaseStatusPayload, UserRole } from "@asc/types";
import { http } from "./http";

export function getDashboardData(role: UserRole): Promise<DashboardDataResponse> {
  return http.get<DashboardDataResponse>(API_ROUTES.dashboard, { query: { role } });
}

export function updateCaseStatus(caseId: string, status: CaseStatus): Promise<GICase> {
  const body: UpdateCaseStatusPayload = { status };
  return http.patch<GICase>(API_ROUTES.caseStatus(caseId), body);
}
