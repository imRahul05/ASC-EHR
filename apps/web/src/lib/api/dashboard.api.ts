import type { GICase, UserRole } from "@asc/types";
import {
  type DashboardDataResponse,
  mockFetchDashboardData,
  mockUpdateCaseStatus,
} from "../mock/handlers/dashboard.mock";

/**
 * Dashboard API module.
 * Currently backed by the centralized mock layer.
 * To connect to real backend, replace mock calls with:
 * return http.get<DashboardDataResponse>(`/dashboard?role=${role}`);
 */
export async function getDashboardData(role: UserRole): Promise<DashboardDataResponse> {
  return mockFetchDashboardData(role);
}

export async function updateCaseStatus(
  caseId: string,
  newStatus: GICase["status"]
): Promise<GICase> {
  return mockUpdateCaseStatus(caseId, newStatus);
}
