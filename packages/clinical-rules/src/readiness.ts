import type {
  OverallReadiness,
  ReadinessCheck,
  ReadinessCheckName,
} from "@asc/types";

/**
 * Non-waivable check rules per REQ-5 §202:
 * "Some checks cannot be waived: consent and identity."
 */
export const NON_WAIVABLE_CHECKS: readonly ReadinessCheckName[] = ["identity", "consent"] as const;

/**
 * Returns true if the check can legally be waived by an authorized role.
 * Identity and consent can NEVER be waived per REQ-5 §202.
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
