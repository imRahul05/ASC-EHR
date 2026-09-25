import type { DashboardMetricSummary } from "@asc/types";

export const MOCK_METRIC_SUMMARY: DashboardMetricSummary = {
  totalCasesToday: 18,
  completedCases: 7,
  activeInOR: 2,
  inPACU: 3,
  pendingSignatures: 3,
  adenomaDetectionRate: 38.6, // Benchmark is > 25% for men, > 15% for women
  cecalIntubationRate: 98.4,  // Benchmark is > 95%
  averageTurnaroundMinutes: 11.2,
  unbilledCasesCount: 4,
};

export interface RecentAuditLogItem {
  readonly id: string;
  readonly timestamp: string;
  readonly actor: string;
  readonly action: string;
  readonly patientMrn: string;
  readonly severity: "INFO" | "WARNING" | "CRITICAL";
}

export const MOCK_AUDIT_LOGS: readonly RecentAuditLogItem[] = [
  {
    id: "log_01",
    timestamp: "08:14:22 AM",
    actor: "Dr. Arthur Vance, MD",
    action: "Attested Cecal Landmark & Insertion Timestamp",
    patientMrn: "MRN-83921",
    severity: "INFO",
  },
  {
    id: "log_02",
    timestamp: "08:02:11 AM",
    actor: "Sarah Jenkins, RN",
    action: "Completed Universal Protocol Surgical Time-Out",
    patientMrn: "MRN-83921",
    severity: "INFO",
  },
  {
    id: "log_03",
    timestamp: "07:55:04 AM",
    actor: "Dr. Elena Rostova, MD",
    action: "Cleared ASA Airway Mallampati Class II for IV Sedation",
    patientMrn: "MRN-83921",
    severity: "INFO",
  },
  {
    id: "log_04",
    timestamp: "07:35:19 AM",
    actor: "Marcus Vance, MHA",
    action: "Assigned Room Endo Suite 1 to Block Dr. Arthur Vance",
    patientMrn: "N/A",
    severity: "INFO",
  },
];
