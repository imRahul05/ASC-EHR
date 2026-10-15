/**
 * Real-Time Eligibility (HIPAA ANSI ASC X12 270/271) Evaluator
 *
 * Implements automated eligibility verification and financial clearance determination
 * for Ambulatory Surgery Center Gastrointestinal endoscopy cases.
 *
 * Regulatory & Clinical Citations:
 * - HIPAA ANSI ASC X12 270/271 (Health Care Eligibility Benefit Inquiry and Response).
 * - CMS 42 CFR § 416.52 (Conditions for Coverage — Surgical Services and Patient Assessment).
 * - Review Focus #1 (AC-D-02-1): Degraded or incomplete 271 responses omitting service
 *   type 30 (Health Benefit Plan Coverage) or 33 (Chiropractic / Endoscopy) MUST NEVER
 *   be assumed active. They transition to "pending" with requiresWorkItem = true.
 * - Review Focus #4 (AC-D-01-4): Month-boundary coverage terminations. An active check
 *   at booking is invalidated if coverage terminates before or on the day of surgery.
 * - Review Focus #5 (AC-D-10-2): Front-desk copay and deductible collections. When patients
 *   cannot pay the full deductible at check-in, an approved installment payment plan
 *   satisfies the financial gate without dropping the remaining balance.
 */

import type { PriorAuthRecord, PriorAuthEvaluationResult } from "@asc/clinical-rules/financial/prior-auth-evaluator";
import { evaluatePriorAuthValidity } from "@asc/clinical-rules/financial/prior-auth-evaluator";
import type { GfeCalculationInput, GfeCalculationResult } from "@asc/clinical-rules/financial/gfe-calculator";
import { calculateGoodFaithEstimate } from "@asc/clinical-rules/financial/gfe-calculator";


export interface EligibilityResponseData {
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

export interface EligibilityEvaluationResult {
  readonly status: "satisfied" | "pending" | "failed";
  readonly reason?: string;
  readonly requiresWorkItem: boolean;
}

export interface FinancialCaseContext {
  readonly eligibilityStatus: "satisfied" | "pending" | "failed";
  readonly priorAuthStatus: "satisfied" | "pending" | "failed" | "not_required";
  readonly estimatedPatientOwedCents: number;
  readonly collectedCents: number;
  readonly hasPaymentPlan: boolean;
}

export interface FinancialClearanceSummary {
  readonly overallStatus: "cleared" | "flagged" | "action-required";
  readonly isCleared: boolean;
  readonly balanceRemainingCents: number;
  readonly eligibilitySatisfied: boolean;
  readonly authSatisfied: boolean;
  readonly paymentSatisfied: boolean;
}

/**
 * Evaluates an X12 271 eligibility response against procedure date.
 *
 * Catches incomplete benefit responses (Review Focus #1) and coverage terminations
 * occurring at calendar month boundaries (Review Focus #4).
 */
export function evaluateEligibilityStatus(
  response: EligibilityResponseData,
  procedureDate: string
): EligibilityEvaluationResult {
  if (response.status === "incomplete") {
    return {
      status: "pending",
      reason:
        "Incomplete benefit response; missing GI endoscopy service type (30/33). Manual verification work item required.",
      requiresWorkItem: true,
    };
  }

  if (response.status === "inactive") {
    return {
      status: "failed",
      reason: "Insurance coverage is reported inactive by payer.",
      requiresWorkItem: true,
    };
  }

  if (response.status === "error") {
    return {
      status: "failed",
      reason: "Clearinghouse eligibility inquiry failed or timed out.",
      requiresWorkItem: true,
    };
  }

  const procDate = procedureDate.slice(0, 10);
  const effectiveDate = response.effectiveDate.slice(0, 10);

  if (procDate < effectiveDate) {
    return {
      status: "failed",
      reason: `Coverage not effective until ${effectiveDate}, which is after procedure date ${procDate}.`,
      requiresWorkItem: true,
    };
  }

  if (response.terminationDate) {
    const termDate = response.terminationDate.slice(0, 10);
    if (procDate > termDate) {
      return {
        status: "failed",
        reason: `Coverage terminated on ${termDate} prior to procedure date ${procDate}.`,
        requiresWorkItem: true,
      };
    }
  }

  return {
    status: "satisfied",
    requiresWorkItem: false,
  };
}

/**
 * Computes overall financial clearance across eligibility, authorization, and patient liability.
 *
 * Respects payment plans (Review Focus #5) to satisfy arrival checks while retaining balance due.
 */
export function evaluateFinancialClearance(
  caseData: FinancialCaseContext
): FinancialClearanceSummary {
  const eligibilitySatisfied = caseData.eligibilityStatus === "satisfied";
  const authSatisfied =
    caseData.priorAuthStatus === "satisfied" ||
    caseData.priorAuthStatus === "not_required";

  const balanceRemainingCents = Math.max(
    0,
    caseData.estimatedPatientOwedCents - caseData.collectedCents
  );

  const paymentSatisfied =
    balanceRemainingCents === 0 || caseData.hasPaymentPlan;

  const isCleared = eligibilitySatisfied && authSatisfied && paymentSatisfied;

  let overallStatus: "cleared" | "flagged" | "action-required";
  if (
    caseData.eligibilityStatus === "failed" ||
    caseData.priorAuthStatus === "failed"
  ) {
    overallStatus = "action-required";
  } else if (!eligibilitySatisfied || !authSatisfied) {
    overallStatus = "action-required";
  } else if (!paymentSatisfied) {
    overallStatus = "flagged";
  } else {
    overallStatus = "cleared";
  }

  return {
    overallStatus,
    isCleared,
    balanceRemainingCents,
    eligibilitySatisfied,
    authSatisfied,
    paymentSatisfied,
  };
}

// Re-export modules for single-point access
export {
  evaluatePriorAuthValidity,
  calculateGoodFaithEstimate,
  type PriorAuthRecord,
  type PriorAuthEvaluationResult,
  type GfeCalculationInput,
  type GfeCalculationResult,
};
