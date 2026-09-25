/**
 * Routing: which LOGICAL models serve each reasoning tier, in fallback order.
 *
 * Hosting-independent: the router resolves each model through the active
 * hosting target and skips models that target does not host. For PHI calls it
 * also drops models whose endpoint has `baa: false` — `validateAgentConfig`
 * checks every target still has a BAA model for PHI-capable tiers.
 */

import { Models, type ModelRef } from './models.js';
import { Reasoning, type ReasoningTier } from './reasoning.js';

export type RoutingTable = Readonly<Record<ReasoningTier, readonly ModelRef[]>>;

export const ROUTING_PROFILES = {
  /** Production routing. */
  default: {
    [Reasoning.High]: [Models.claudeOpus55, Models.gpt6Astra, Models.claudeFable51],
    [Reasoning.Medium]: [Models.gpt6Sol, Models.claudeSonnet5, Models.gpt56Sol, Models.gemini38Flash],
    [Reasoning.Low]: [Models.gemini35FlashLite, Models.gpt6Luna, Models.claudeHaiku45, Models.gpt56Luna],
  },

  /** Cost-controlled routing for staging / automated tests (synthetic data only). */
  budget: {
    [Reasoning.High]: [Models.claudeSonnet5, Models.gpt6Sol],
    [Reasoning.Medium]: [Models.claudeHaiku45, Models.gemini38Flash],
    [Reasoning.Low]: [Models.gemini35FlashLite, Models.claudeHaiku45],
  },
} as const satisfies Record<string, RoutingTable>;

export type RoutingProfile = keyof typeof ROUTING_PROFILES;

export const DEFAULT_ROUTING_PROFILE: RoutingProfile = 'default';
