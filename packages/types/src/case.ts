export type CaseStatus =
  | "SCHEDULED"
  | "CHECKED_IN"
  | "PRE_OP"
  | "IN_PROCEDURE"
  | "PACU"
  | "DISCHARGED"
  | "CANCELLED";

export type ProcedureType =
  | "COLONOSCOPY"
  | "EGD"
  | "FLEX_SIGMOIDOSCOPY"
  | "EGD_COLONOSCOPY_COMBO";

export type AsaScores = "ASA_I" | "ASA_II" | "ASA_III" | "ASA_IV";

export interface GICase {
  readonly id: string;
  readonly mrn: string;
  readonly patientName: string;
  readonly patientInitials: string;
  readonly patientDob: string;
  readonly roomNumber: string;
  readonly scheduledTime: string;
  readonly procedureType: ProcedureType;
  readonly procedureTitle: string;
  readonly status: CaseStatus;
  readonly primarySurgeonId: string;
  readonly primarySurgeonName: string;
  readonly anesthesiologistId: string;
  readonly anesthesiologistName: string;
  readonly circulatingNurseId: string;
  readonly circulatingNurseName: string;
  readonly asaScore?: AsaScores;
  readonly mallampatiScore?: 1 | 2 | 3 | 4;
  readonly npoConfirmed: boolean;
  readonly bowelPrepQuality?: "EXCELLENT" | "GOOD" | "FAIR" | "POOR";
  readonly timeOutCompleted: boolean;
  readonly reportSigned: boolean;
  readonly aldreteScore?: number;
  readonly escortConfirmed: boolean;
  readonly notes?: string;
}

export interface DashboardMetricSummary {
  readonly totalCasesToday: number;
  readonly completedCases: number;
  readonly activeInOR: number;
  readonly inPACU: number;
  readonly pendingSignatures: number;
  readonly adenomaDetectionRate: number;
  readonly cecalIntubationRate: number;
  readonly averageTurnaroundMinutes: number;
  readonly unbilledCasesCount: number;
}
