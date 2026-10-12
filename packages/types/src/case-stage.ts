/**
 * Physical patient stage and computed readiness data model.
 * Decouples physical patient location (CaseStage) from clinical and administrative readiness (ReadinessCheck).
 * Specification: requirements_document.md §5 (lines 154–210) [REQ-5].
 */

/**
 * 12 strictly physical patient stages per REQ-5 §164–180.
 * A case stage represents where the patient physically is in the surgical center.
 */
export type CaseStage =
  | "requested"
  | "scheduled"
  | "confirmed"
  | "arrived"
  | "preop"
  | "in_room"
  | "procedure_start"
  | "procedure_end"
  | "pacu"
  | "discharged"
  | "cancelled"
  | "no_show";

/**
 * 12 computed readiness checks per REQ-5 §185–199.
 * Readiness is the aggregate of these named checks and is computed dynamically.
 */
export type ReadinessCheckName =
  | "identity"
  | "coverage"
  | "benefits"
  | "authorization"
  | "estimate"
  | "consent"
  | "hp"
  | "anticoagulation"
  | "anesthesia_clearance"
  | "prep"
  | "escort"
  | "equipment";

export type ReadinessCheckStatus = "satisfied" | "pending" | "failed" | "waived";

export interface ReadinessCheck {
  readonly name: ReadinessCheckName;
  readonly status: ReadinessCheckStatus;
  readonly label: string;
  readonly details?: string;
  readonly waivedBy?: string;
  readonly waivedAt?: string;
  readonly waiverReason?: string;
}

export type OverallReadiness = "ready" | "pending" | "blocked";

/**
 * Non-waivable check rules per REQ-5 §202:
 * "Some checks cannot be waived: consent and identity."
 */
export const NON_WAIVABLE_CHECKS: readonly ReadinessCheckName[] = ["identity", "consent"] as const;

/**
 * Returns true if the check can legally be waived by an authorized role.
 * Identity and consent can NEVER be waived.
 */
export function canWaiveCheck(name: ReadinessCheckName): boolean {
  return name !== "identity" && name !== "consent";
}

/**
 * Computes overall readiness from an array of readiness checks per REQ-5 §200:
 * - "ready": Every check is satisfied or waived.
 * - "blocked": Any check is failed.
 * - "pending": Otherwise.
 */
export function computeOverallReadiness(checks: readonly ReadinessCheck[]): OverallReadiness {
  if (checks.length === 0) return "pending";
  if (checks.some((check) => check.status === "failed")) return "blocked";
  if (checks.every((check) => check.status === "satisfied" || check.status === "waived")) return "ready";
  return "pending";
}
