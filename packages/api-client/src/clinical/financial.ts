/**
 * Financial Clearance Clinical API Client
 *
 * Provides typed SDK methods for:
 * 1. HIPAA ANSI ASC X12 270/271 real-time eligibility checks.
 * 2. Financial summary retrieval with dual GFE breakdown (ACA § 300gg-13, No Surprises Act 45 CFR § 149).
 * 3. Patient copay/deductible collection and payment plan logging.
 * 4. HIPAA ANSI ASC X12 278 prior authorization revalidation.
 */

import { API_ROUTES } from "@asc/config/api";
import type {
  CopayCollectionResult,
  EligibilityCheckResult,
  FinancialSummary,
  PriorAuthResult,
} from "@asc/types";
import type {
  CopayCollection,
  EligibilityCheckRequest,
  PriorAuthCheck,
} from "@asc/validation/financial";
import { http } from "../http.js";

/**
 * Executes real-time ANSI X12 270 inquiry against payer clearinghouse and evaluates
 * benefit eligibility and endoscopy coverage levels.
 */
export function checkEligibility(
  caseId: string,
  payload?: EligibilityCheckRequest,
  facilityId?: string,
): Promise<EligibilityCheckResult> {
  const trimmed = facilityId?.trim();
  return http.post(API_ROUTES.caseEligibilityCheck(caseId), payload ?? { caseId }, {
    query: trimmed ? { facilityId: trimmed } : undefined,
    headers: trimmed ? { "x-facility-id": trimmed } : undefined,
  });
}

export const checkCaseEligibility = checkEligibility;

/**
 * Retrieves the comprehensive financial clearance summary, including active benefits,
 * prior auth status, copay balance, and dual Good-Faith Estimate (GFE).
 */
export function getFinancialSummary(
  caseId: string,
  facilityId?: string,
): Promise<FinancialSummary> {
  const trimmed = facilityId?.trim();
  return http.get(API_ROUTES.caseFinancialSummary(caseId), {
    query: trimmed ? { facilityId: trimmed } : undefined,
    headers: trimmed ? { "x-facility-id": trimmed } : undefined,
  });
}

/**
 * Records front-desk collection of patient copay/deductible or sets up an installment payment plan.
 */
export function collectCopay(
  caseId: string,
  payload: CopayCollection,
  facilityId?: string,
): Promise<CopayCollectionResult> {
  const trimmed = facilityId?.trim();
  return http.post(API_ROUTES.caseCopayCollected(caseId), payload, {
    query: trimmed ? { facilityId: trimmed } : undefined,
    headers: trimmed ? { "x-facility-id": trimmed } : undefined,
  });
}

/**
 * Records prior authorization details (X12 278) and evaluates procedure date validity.
 */
export function recordPriorAuth(
  caseId: string,
  payload: PriorAuthCheck,
  facilityId?: string,
): Promise<PriorAuthResult> {
  const trimmed = facilityId?.trim();
  return http.post(API_ROUTES.casePriorAuth(caseId), payload, {
    query: trimmed ? { facilityId: trimmed } : undefined,
    headers: trimmed ? { "x-facility-id": trimmed } : undefined,
  });
}
