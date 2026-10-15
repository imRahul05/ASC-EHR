/**
 * Clearinghouse & Financial Domain Types
 *
 * Defines the pluggable boundary adapter for HIPAA ANSI ASC X12 270/271 real-time
 * eligibility benefit inquiry and response exchanges.
 */

export interface ClearinghouseInquiryParams {
  readonly memberId: string;
  readonly payerId: string;
  readonly patientDob: string;
  readonly patientFirstName: string;
  readonly patientLastName: string;
  readonly serviceTypeCode?: string;
}

export interface ClearinghouseEligibilityResult {
  readonly status: "active" | "inactive" | "incomplete" | "error";
  readonly planName: string;
  readonly planType: string;
  readonly effectiveDate: string;
  readonly terminationDate?: string;
  readonly subscriberRelationship: "self" | "spouse" | "child" | "other";
  readonly inNetwork: boolean;
  readonly individualDeductibleCents: number;
  readonly individualDeductibleRemainingCents: number;
  readonly familyDeductibleCents?: number;
  readonly familyDeductibleRemainingCents?: number;
  readonly copayCents: number;
  readonly coinsurancePercent: number;
  readonly outOfPocketMaxCents: number;
  readonly outOfPocketRemainingCents: number;
  readonly rawPayload?: Record<string, string | number | boolean | null>;
  readonly checkedAt: string;
}

export interface ClearinghouseAdapter {
  checkEligibility(params: ClearinghouseInquiryParams): Promise<ClearinghouseEligibilityResult>;
}

export interface FinancialEstimateBreakdown {
  readonly estimatedScreeningPatientOwedCents: number;
  readonly estimatedTherapeuticPatientOwedCents: number;
  readonly patientResponsibilityCents: number;
  readonly preventiveMandateApplies: boolean;
}

export interface FinancialSummary {
  readonly caseId: string;
  readonly eligibilityStatus: "active" | "inactive" | "incomplete" | "error" | "pending";
  readonly planName: string;
  readonly planType: string;
  readonly inNetwork: boolean;
  readonly deductibleCents: number;
  readonly deductibleRemainingCents: number;
  readonly copayCents: number;
  readonly coinsurancePercent: number;
  readonly outOfPocketMaxCents: number;
  readonly outOfPocketRemainingCents: number;
  readonly priorAuthStatus: string;
  readonly authNumber: string;
  readonly estimate: FinancialEstimateBreakdown;
  readonly collectedCents: number;
  readonly balanceRemainingCents: number;
  readonly hasPaymentPlan: boolean;
  readonly overallStatus: "satisfied" | "pending" | "failed";
  readonly isCleared: boolean;
}

export interface EligibilityEvaluationInfo {
  readonly status: "satisfied" | "pending" | "failed";
  readonly reason?: string;
  readonly requiresWorkItem: boolean;
}

export interface EligibilityCheckResult {
  readonly eligibility: ClearinghouseEligibilityResult;
  readonly evaluation: EligibilityEvaluationInfo;
  readonly requestId: string;
  readonly responseId: string;
}

export interface CopayCollectionResult {
  readonly caseId: string;
  readonly paidCents: number;
  readonly totalCollectedCents: number;
  readonly paymentMethod: string;
  readonly transactionRef: string;
  readonly paymentPlanActive: boolean;
}

export interface PriorAuthEvaluationInfo {
  readonly status: "satisfied" | "pending" | "failed" | "not_required";
  readonly isExpired: boolean;
  readonly codeMismatch: boolean;
  readonly reason?: string;
}

export interface PriorAuthResult {
  readonly priorAuth: {
    readonly authNumber: string;
    readonly status: "approved" | "denied" | "pending" | "not_required";
    readonly validFrom: string;
    readonly validTo: string;
    readonly approvedCptCodes: readonly string[];
    readonly approvedUnits: number;
    readonly notes?: string;
  };
  readonly evaluation: PriorAuthEvaluationInfo;
}
