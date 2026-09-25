import type { DashboardMetricSummary, GICase, UserRole } from "@asc/types";
import { MOCK_GI_CASES } from "../data/cases.mock";
import { MOCK_AUDIT_LOGS, MOCK_METRIC_SUMMARY, type RecentAuditLogItem } from "../data/metrics.mock";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export interface DashboardDataResponse {
  readonly metrics: DashboardMetricSummary;
  readonly cases: readonly GICase[];
  readonly auditLogs: readonly RecentAuditLogItem[];
  readonly userRole: UserRole;
}

export async function mockFetchDashboardData(role: UserRole): Promise<DashboardDataResponse> {
  await delay(120);

  let filteredCases = [...MOCK_GI_CASES];

  if (role === "SURGEON") {
    // Surgeon sees cases assigned to Dr. Arthur Vance
    filteredCases = MOCK_GI_CASES.filter(
      (c) => c.primarySurgeonId === "usr_surgeon_01" || c.status === "IN_PROCEDURE"
    );
  } else if (role === "ANESTHESIOLOGIST") {
    // Anesthesiologist sees cases requiring sedation or PACU
    filteredCases = MOCK_GI_CASES.filter(
      (c) => c.status === "PRE_OP" || c.status === "IN_PROCEDURE" || c.status === "PACU"
    );
  } else if (role === "PATIENT") {
    // Patient sees only their own case
    filteredCases = MOCK_GI_CASES.filter((c) => c.mrn === "MRN-83921");
  }

  return {
    metrics: MOCK_METRIC_SUMMARY,
    cases: filteredCases,
    auditLogs: MOCK_AUDIT_LOGS,
    userRole: role,
  };
}

export async function mockUpdateCaseStatus(
  caseId: string,
  newStatus: GICase["status"]
): Promise<GICase> {
  await delay(100);

  const target = MOCK_GI_CASES.find((c) => c.id === caseId) ?? MOCK_GI_CASES[0];
  return {
    ...target,
    status: newStatus,
  };
}
