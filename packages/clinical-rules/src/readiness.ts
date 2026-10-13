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
 * Maps an array of readiness checks by check name for constant-time lookup.
 */
export function mapReadinessChecks(
  checks: readonly ReadinessCheck[],
): ReadonlyMap<ReadinessCheckName, ReadinessCheck> {
  const map = new Map<ReadinessCheckName, ReadinessCheck>();
  for (const check of checks) {
    map.set(check.name, check);
  }
  return map;
}

/**
 * Evaluates whether a readiness check is satisfied or legally waived.
 */
export function isCheckSatisfiedOrWaived(check: ReadinessCheck | undefined): boolean {
  if (!check) return false;
  if (check.status === "satisfied") return true;
  if (check.status === "waived") return canWaiveCheck(check.name);
  return false;
}

/**
 * Computes overall readiness from an array of readiness checks per REQ-5 §200:
 * - "ready": Every check is satisfied or legally waived.
 * - "blocked": Any check is failed, or an illegal waiver was attempted on a non-waivable check.
 * - "pending": Otherwise.
 */
export function computeOverallReadiness(checks: readonly ReadinessCheck[]): OverallReadiness {
  if (checks.length === 0) return "pending";
  if (checks.some((check) => check.status === "failed" || (check.status === "waived" && !canWaiveCheck(check.name)))) {
    return "blocked";
  }
  if (checks.every((check) => isCheckSatisfiedOrWaived(check))) return "ready";
  return "pending";
}
