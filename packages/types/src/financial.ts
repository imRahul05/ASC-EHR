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
