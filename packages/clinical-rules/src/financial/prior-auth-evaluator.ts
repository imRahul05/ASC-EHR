/**
 * Prior Authorization (HIPAA ANSI ASC X12 278) Evaluator
 *
 * Implements pre-service review revalidation for Ambulatory Surgery Center GI procedures.
 *
 * Clinical & Regulatory Rationale:
 * - HIPAA ANSI ASC X12 278 establishes electronic health care services review standards.
 * - ASC Prior Authorizations (e.g. for screening or therapeutic endoscopy) are strictly
 *   bound to a specific calendar date window (validFrom to validTo), approved CPT codes,
 *   and authorized procedure units.
 * - Case Rescheduling (Review Focus #2 / AC-D-07-1): Rescheduling a procedure beyond
 *   validTo or before validFrom invalidates the payer guarantee, risking full claim denial.
 *   The engine must immediately mark authorization as failed, isExpired = true, and block confirm.
 * - CPT Mismatch: If the clinical team changes the planned procedure (e.g. from EGD 43239 to
 *   colonoscopy 45378), the authorization is invalid unless the payer amends the 278.
 */

export interface PriorAuthRecord {
  readonly authNumber: string;
  readonly status: "approved" | "denied" | "pending" | "not_required";
  readonly validFrom: string;
  readonly validTo: string;
  readonly approvedCptCodes: readonly string[];
  readonly approvedUnits: number;
  readonly notes?: string;
}

export interface PriorAuthEvaluationResult {
  readonly status: "satisfied" | "pending" | "failed" | "not_required";
  readonly isExpired: boolean;
  readonly codeMismatch: boolean;
  readonly reason?: string;
}

/**
 * Revalidates an X12 278 prior authorization against the planned procedure date and CPT code.
 *
 * @param auth Prior authorization record on file, or null if none recorded.
 * @param procedureDate ISO date string (YYYY-MM-DD) of the scheduled procedure.
 * @param plannedCptCode 5-digit CPT code planned for the encounter.
 */
export function evaluatePriorAuthValidity(
  auth: PriorAuthRecord | null,
  procedureDate: string,
  plannedCptCode: string
): PriorAuthEvaluationResult {
  if (!auth) {
    return {
      status: "pending",
      isExpired: false,
      codeMismatch: false,
      reason: "Prior authorization record missing; review required before confirmation.",
    };
  }

  if (auth.status === "not_required") {
    return {
      status: "not_required",
      isExpired: false,
      codeMismatch: false,
    };
  }

  if (auth.status === "denied") {
    return {
      status: "failed",
      isExpired: false,
      codeMismatch: false,
      reason: "Prior authorization denied by payer.",
    };
  }

  if (auth.status === "pending") {
    return {
      status: "pending",
      isExpired: false,
      codeMismatch: false,
      reason: "Prior authorization pending payer determination.",
    };
  }

  // Extract date part (YYYY-MM-DD) for reliable calendar day comparisons
  const procDate = procedureDate.slice(0, 10);
  const fromDate = auth.validFrom.slice(0, 10);
  const toDate = auth.validTo.slice(0, 10);

  const isExpired = procDate < fromDate || procDate > toDate;
  if (isExpired) {
    return {
      status: "failed",
      isExpired: true,
      codeMismatch: false,
      reason: `Procedure date ${procDate} outside authorization window (${fromDate} to ${toDate}). Payer re-authorization required.`,
    };
  }

  const codeMatch = auth.approvedCptCodes.includes(plannedCptCode);
  if (!codeMatch) {
    return {
      status: "failed",
      isExpired: false,
      codeMismatch: true,
      reason: `Planned CPT ${plannedCptCode} not in approved codes: ${auth.approvedCptCodes.join(", ")}. Prior auth update required.`,
    };
  }

  return {
    status: "satisfied",
    isExpired: false,
    codeMismatch: false,
  };
}
