/**
 * Agent Model Router.
 *
 * Resolves a (TaskType, complexity, containsPhi) triple into an ordered,
 * compliance-filtered chain of concrete LanguageModels.
 *
 * All functions accept an optional `RoutingContext` so tests (and future
 * per-tenant setups) can inject a registry / routing table instead of the
 * centralized defaults in `config/`.
 *
 * ADR: docs/decisions/2026-09-25-centralize-agent-configuration-and-model-routing.md
 */

import type { LanguageModel } from 'ai';

import {
  PROVIDER_REGISTRY,
  ROUTING_TABLE,
  TASK_TIER_MAP,
  type FallbackEntry,
  type ProviderName,
  type ProviderRegistry,
  type ReasoningTier,
  type RoutingTable,
  type TaskType,
} from './config/index.js';
import { NoAvailableModelError, NoCompliantModelError } from './errors.js';

// Re-export for consumers
export type { TaskType, ReasoningTier };

/** Alias used by gateway callers for the requested reasoning tier. */
export type TaskComplexity = ReasoningTier;

/** Injectable routing configuration. Defaults to the centralized config. */
export interface RoutingContext {
  registry?: ProviderRegistry;
  routing?: RoutingTable;
  taskTierMap?: Record<TaskType, ReasoningTier>;
}

/** A routing entry resolved to a concrete adapter, with its identity for audit. */
export interface ResolvedModel {
  provider: ProviderName;
  modelKey: string;
  modelId: string;
  baa: boolean;
  model: LanguageModel;
}

export interface FallbackChainOptions extends RoutingContext {
  /** When true, the chain is restricted to providers with a signed BAA. */
  containsPhi: boolean;
}

const TIER_RANK: Record<ReasoningTier, number> = { low: 0, medium: 1, high: 2 };

// ─────────────────────────────────────────────────────────────
// Core resolution logic
// ─────────────────────────────────────────────────────────────

/**
 * The effective tier is the HIGHER of:
 *   - the tier implied by `taskType` (via TASK_TIER_MAP)
 *   - the explicit `complexity` requested by the caller
 *
 * Callers can escalate but never downgrade below the task's minimum tier.
 */
export function resolveEffectiveTier(
  taskType: TaskType,
  complexity: TaskComplexity,
  taskTierMap: Record<TaskType, ReasoningTier> = TASK_TIER_MAP,
): ReasoningTier {
  const impliedTier = taskTierMap[taskType];
  return TIER_RANK[complexity] >= TIER_RANK[impliedTier] ? complexity : impliedTier;
}

/**
 * Resolves a single FallbackEntry into a concrete model.
 * Throws if the provider or model key is unknown / deprecated.
 */
export function resolveModel(
  entry: FallbackEntry,
  registry: ProviderRegistry = PROVIDER_REGISTRY,
): ResolvedModel {
  const catalog = registry[entry.provider];
  const modelEntry = catalog.models[entry.modelKey];
  if (!modelEntry) {
    throw new Error(
      `Unknown model key "${entry.modelKey}" for provider "${entry.provider}". ` +
        `Available: ${Object.keys(catalog.models).join(', ')}`,
    );
  }

  if (modelEntry.deprecated) {
    throw new Error(`Model "${entry.modelKey}" is deprecated. Remove it from ROUTING_TABLE.`);
  }

  return {
    provider: entry.provider,
    modelKey: entry.modelKey,
    modelId: modelEntry.id,
    baa: catalog.baa,
    model: catalog.getAdapter(modelEntry.id),
  };
}

/**
 * Returns the ordered fallback chain for a tier: deprecated/unknown models are
 * skipped and, when `containsPhi` is true, non-BAA providers are removed.
 *
 * Throws NoCompliantModelError (PHI) or NoAvailableModelError when empty, so
 * callers never receive an empty chain.
 */
export function getFallbackChain(
  tier: ReasoningTier,
  { containsPhi, registry = PROVIDER_REGISTRY, routing = ROUTING_TABLE }: FallbackChainOptions,
): ResolvedModel[] {
  const usable = routing[tier].filter((e) => {
    const model = registry[e.provider].models[e.modelKey];
    return model !== undefined && !model.deprecated;
  });

  const allowed = containsPhi ? usable.filter((e) => registry[e.provider].baa) : usable;

  if (allowed.length === 0) {
    throw containsPhi ? new NoCompliantModelError(tier) : new NoAvailableModelError(tier);
  }

  return allowed.map((e) => resolveModel(e, registry));
}

/**
 * Returns the PRIMARY (first eligible) model for a task, using the effective
 * tier (see `resolveEffectiveTier`).
 */
export function getModelForTask(
  taskType: TaskType,
  complexity: TaskComplexity,
  options: FallbackChainOptions,
): ResolvedModel {
  const tier = resolveEffectiveTier(taskType, complexity, options.taskTierMap);
  const [primary] = getFallbackChain(tier, options);
  // Unreachable: getFallbackChain throws instead of returning an empty chain.
  if (!primary) throw new NoAvailableModelError(tier);
  return primary;
}

/**
 * Returns metadata about the configured chain for a tier (unfiltered).
 * Safe for the frontend: contains no keys and no adapters.
 */
export function getRoutingInfo(
  tier: ReasoningTier,
  { registry = PROVIDER_REGISTRY, routing = ROUTING_TABLE }: RoutingContext = {},
) {
  return routing[tier].map((e) => {
    const catalog = registry[e.provider];
    const model = catalog.models[e.modelKey];
    return {
      provider: e.provider,
      providerDisplayName: catalog.displayName,
      baa: catalog.baa,
      modelKey: e.modelKey,
      modelLabel: model?.label ?? e.modelKey,
      modelDescription: model?.description ?? '',
      deprecated: model?.deprecated ?? false,
    };
  });
}
