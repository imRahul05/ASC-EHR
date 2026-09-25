/**
 * Reasoning tiers — the ONLY place tier names are defined.
 *
 * Use the `Reasoning` constant everywhere (`Reasoning.High`), never raw strings.
 * A tier is a quality/cost/latency class; which concrete models serve it is
 * decided by the routing table (`routing.ts`), not by the model definitions.
 */

export const Reasoning = {
  /** Fast + cheap. Classification, extraction, validation. */
  Low: 'low',
  /** Balanced. Summaries, drafting, general assistance. */
  Medium: 'medium',
  /** Strongest models. Coding, diagnostic reasoning, anything high-stakes. */
  High: 'high',
} as const;

export type ReasoningTier = (typeof Reasoning)[keyof typeof Reasoning];

/** All tiers, ordered lowest → highest. */
export const REASONING_TIERS = [
  Reasoning.Low,
  Reasoning.Medium,
  Reasoning.High,
] as const satisfies readonly ReasoningTier[];

/** Human-readable description per tier (safe to show in the UI). */
export const REASONING_TIER_INFO = {
  [Reasoning.Low]: {
    label: 'Low',
    useFor: 'Classification, extraction, validation — high volume, latency-sensitive.',
  },
  [Reasoning.Medium]: {
    label: 'Medium',
    useFor: 'Summaries, drafting, general assistance.',
  },
  [Reasoning.High]: {
    label: 'High',
    useFor: 'Medical coding, diagnostic reasoning, high-stakes clinical output.',
  },
} as const satisfies Record<ReasoningTier, { label: string; useFor: string }>;

export function isReasoningTier(value: unknown): value is ReasoningTier {
  return REASONING_TIERS.some((tier) => tier === value);
}

/** Returns the higher of two tiers (`b` is optional, e.g. a caller override). */
export function maxReasoning(a: ReasoningTier, b?: ReasoningTier): ReasoningTier {
  if (b === undefined) return a;
  return REASONING_TIERS.indexOf(b) > REASONING_TIERS.indexOf(a) ? b : a;
}
