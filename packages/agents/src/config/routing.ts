/**
 * Routing: which models serve each reasoning tier, in fallback order.
 *
 * The first model is the primary; the rest are tried only on transient errors.
 * For PHI calls the gateway first removes models whose provider has `baa: false`,
 * so every tier should keep at least one BAA-covered model (checked by
 * `validateAgentConfig`).
 */

import type { ModelRef } from './define.js';
import { Models, type ProviderName } from './providers/index.js';
import { Reasoning, type ReasoningTier } from './reasoning.js';

export type RoutingTable = Readonly<Record<ReasoningTier, readonly ModelRef<ProviderName>[]>>;

export const ROUTING_PROFILES = {
  /** Production routing. */
  default: {
    [Reasoning.High]: [
      Models.anthropic.opus55,
      Models.openai.gpt6Astra,
      Models.anthropic.fable51,
    ],
    [Reasoning.Medium]: [
      Models.openai.gpt6Sol,
      Models.anthropic.sonnet5,
      Models.openai.gpt56Sol,
      Models.google.gemini38Flash,
    ],
    [Reasoning.Low]: [
      Models.google.gemini35FlashLite,
      Models.openai.gpt6Luna,
      Models.anthropic.haiku45,
      Models.openai.gpt56Luna,
    ],
  },

  /** Cost-controlled routing for staging / automated tests (synthetic data only). */
  budget: {
    [Reasoning.High]: [Models.anthropic.sonnet5, Models.openai.gpt6Sol],
    [Reasoning.Medium]: [Models.anthropic.haiku45, Models.google.gemini38Flash],
    [Reasoning.Low]: [Models.google.gemini35FlashLite, Models.anthropic.haiku45],
  },
} as const satisfies Record<string, RoutingTable>;

export type RoutingProfile = keyof typeof ROUTING_PROFILES;

export const DEFAULT_ROUTING_PROFILE: RoutingProfile = 'default';
