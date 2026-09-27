import type { UserRole } from "./auth.js";
import type { CaseStatus, DashboardMetricSummary, GICase } from "./case.js";

export interface RecentAuditLogItem {
  readonly id: string;
  readonly timestamp: string;
  readonly actor: string;
  readonly action: string;
  readonly patientMrn: string;
  readonly severity: "INFO" | "WARNING" | "CRITICAL";
}

/** GET /dashboard?role=<role> */
export interface DashboardDataResponse {
  readonly metrics: DashboardMetricSummary;
  readonly cases: readonly GICase[];
  readonly auditLogs: readonly RecentAuditLogItem[];
  readonly userRole: UserRole;
}

/** PATCH /cases/:caseId/status */
export interface UpdateCaseStatusPayload {
  readonly status: CaseStatus;
}
