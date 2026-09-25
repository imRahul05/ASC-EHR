/**
 * Agent Model Router.
 *
 * Resolves a (TaskType, complexity) pair into a concrete LanguageModel,
 * and provides a fallback-aware execution wrapper.
 *
 * ADR: docs/decisions/2026-09-25-centralize-agent-configuration-and-model-routing.md
 */

import { type LanguageModel } from 'ai';

import {
  PROVIDER_REGISTRY,
  ROUTING_TABLE,
  TASK_TIER_MAP,
  type ProviderName,
  type ReasoningTier,
  type TaskType,
  type FallbackEntry,
} from './config/index.js';

// Re-export for consumers
export type { TaskType, ReasoningTier };

// Also export a simpler alias that gateway.ts already uses
export type TaskComplexity = ReasoningTier;

// ─────────────────────────────────────────────────────────────
// Core resolution logic
// ─────────────────────────────────────────────────────────────

/**
 * Resolves a single FallbackEntry into a concrete LanguageModel.
 * Throws if the provider or model key is unknown / deprecated.
 */
export function resolveModel(entry: FallbackEntry): LanguageModel {
  const catalog = PROVIDER_REGISTRY[entry.provider];
  if (!catalog) {
    throw new Error(`Unknown provider: ${entry.provider}`);
  }

  const modelEntry = catalog.models[entry.modelKey];
  if (!modelEntry) {
    throw new Error(
      `Unknown model key "${entry.modelKey}" for provider "${entry.provider}". ` +
      `Available: ${Object.keys(catalog.models).join(', ')}`
    );
  }

  if (modelEntry.deprecated) {
    throw new Error(
      `Model "${entry.modelKey}" is deprecated. Remove it from ROUTING_TABLE.`
    );
  }

  return catalog.getAdapter(modelEntry.id);
}

/**
 * Returns the full ordered fallback chain for a given reasoning tier.
 * Each element is a resolved LanguageModel ready to use.
 */
export function getFallbackChain(tier: ReasoningTier): LanguageModel[] {
  const entries = ROUTING_TABLE[tier];
  return entries
    .filter((e) => {
      const model = PROVIDER_REGISTRY[e.provider]?.models[e.modelKey];
      return model && !model.deprecated;
    })
    .map((e) => resolveModel(e));
}

/**
 * Returns the PRIMARY (first non-deprecated) model for a task.
 *
 * The effective tier is the HIGHER of:
 *   - the tier implied by `taskType` (via TASK_TIER_MAP)
 *   - the explicit `complexity` override from the caller
 *
 * This lets callers escalate ("I know this looks like data-extraction,
 * but it's actually complex — run it on high") while still having
 * sensible defaults.
 */
export function getModelForTask(taskType: TaskType, complexity: TaskComplexity): LanguageModel {
  const tierRank: Record<ReasoningTier, number> = { low: 0, medium: 1, high: 2 };

  const impliedTier = TASK_TIER_MAP[taskType];
  const effectiveTier: ReasoningTier =
    tierRank[complexity] >= tierRank[impliedTier] ? complexity : impliedTier;

  const chain = getFallbackChain(effectiveTier);
  if (chain.length === 0) {
    throw new Error(`No non-deprecated models available for tier "${effectiveTier}".`);
  }

  return chain[0]!;
}

/**
 * Returns metadata about the fallback chain for a tier.
 * Useful for the frontend to display which models are configured.
 */
export function getRoutingInfo(tier: ReasoningTier) {
  const entries = ROUTING_TABLE[tier];
  return entries.map((e) => {
    const catalog = PROVIDER_REGISTRY[e.provider];
    const model = catalog?.models[e.modelKey];
    return {
      provider: e.provider,
      providerDisplayName: catalog?.displayName ?? e.provider,
      modelKey: e.modelKey,
      modelLabel: model?.label ?? e.modelKey,
      modelDescription: model?.description ?? '',
      deprecated: model?.deprecated ?? false,
    };
  });
}
