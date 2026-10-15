/**
 * Good-Faith Estimate (GFE) & Dual Cost-Sharing Calculator
 *
 * Implements US healthcare regulatory compliance calculations:
 * - Patient Protection and Affordable Care Act (ACA 42 U.S.C. § 300gg-13): Mandates $0
 *   cost-sharing for preventive services without copayment, deductible, or coinsurance.
 * - No Surprises Act (45 CFR § 149): Requires transparent Good-Faith Estimates prior to procedures.
 * - Screening-to-Therapeutic Conversion (Review Focus #3 / AC-D-09-2):
 *   When a screening colonoscopy (CPT 45378) discovers polyps requiring resection (CPT 45385),
 *   claims may require modifier 33 or PT. Because payer adjudication varies across commercial
 *   plans, ASC patients must receive dual disclosure:
 *   1. Screening scenario: $0 out-of-pocket for standard screening.
 *   2. Therapeutic scenario: Estimated deductible and coinsurance if polyps are resected.
 *
 * Integer Cent Precision:
 * All math uses integer cents to prevent IEEE 754 floating-point discrepancies.
 */

export interface GfeCalculationInput {
  readonly cptCode: string;
  readonly intent: "screening" | "diagnostic" | "surveillance";
  readonly allowableFeeCents: number;
  readonly deductibleRemainingCents: number;
  readonly coinsurancePercent: number;
  readonly copayCents: number;
  readonly preventiveMandateApplies: boolean;
  readonly outOfPocketRemainingCents?: number;
}

export interface GfeCalculationResult {
  readonly estimatedScreeningPatientOwedCents: number;
  readonly estimatedTherapeuticPatientOwedCents: number;
  readonly patientResponsibilityCents: number;
  readonly preventiveMandateApplies: boolean;
  readonly breakdown: {
    readonly allowableFeeCents: number;
    readonly copayCents: number;
    readonly deductibleAppliedCents: number;
    readonly coinsuranceOwedCents: number;
  };
}

/**
 * Calculates a dual Good-Faith Estimate for GI endoscopy cases.
 *
 * Handles both the baseline planned intent (screening vs diagnostic) and
 * the therapeutic contingency (polyp removal under modifier 33/PT).
 */
export function calculateGoodFaithEstimate(
  input: GfeCalculationInput
): GfeCalculationResult {
  const {
    intent,
    allowableFeeCents,
    deductibleRemainingCents,
    coinsurancePercent,
    copayCents,
    preventiveMandateApplies,
    outOfPocketRemainingCents,
  } = input;

  // 1. Calculate standard cost-sharing (therapeutic/diagnostic baseline)
  // Copay applies first, reducing the remaining allowable balance
  const afterCopayCents = Math.max(0, allowableFeeCents - copayCents);

  // Deductible is applied up to the remaining deductible or the allowable balance
  const deductibleAppliedCents = Math.min(deductibleRemainingCents, afterCopayCents);

  // Coinsurance applies to the remaining balance after deductible
  const subjectToCoinsuranceCents = Math.max(0, afterCopayCents - deductibleAppliedCents);
  const coinsuranceOwedCents = Math.round(
    (subjectToCoinsuranceCents * coinsurancePercent) / 100
  );

  // Total patient liability for therapeutic / diagnostic service
  const uncappedTherapeuticCents =
    copayCents + deductibleAppliedCents + coinsuranceOwedCents;

  // Patient liability cannot exceed out-of-pocket maximum remaining (if specified)
  const therapeuticOwedCents =
    outOfPocketRemainingCents !== undefined
      ? Math.min(uncappedTherapeuticCents, outOfPocketRemainingCents)
      : uncappedTherapeuticCents;

  // 2. Dual Estimate: Screening vs Therapeutic
  // Under ACA 42 U.S.C. § 300gg-13, preventive screening has $0 cost-sharing
  const isPreventive = preventiveMandateApplies && intent === "screening";
  const screeningOwedCents = isPreventive ? 0 : therapeuticOwedCents;

  const patientResponsibilityCents = isPreventive ? 0 : therapeuticOwedCents;

  return {
    estimatedScreeningPatientOwedCents: screeningOwedCents,
    estimatedTherapeuticPatientOwedCents: therapeuticOwedCents,
    patientResponsibilityCents,
    preventiveMandateApplies: isPreventive,
    breakdown: {
      allowableFeeCents,
      copayCents,
      deductibleAppliedCents,
      coinsuranceOwedCents,
    },
  };
}
