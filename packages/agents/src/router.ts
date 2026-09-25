/**
 * Agent Model Router.
 *
 * Resolves (task, optional reasoning override, containsPhi) into an ordered,
 * compliance-filtered chain of concrete LanguageModels.
 *
 * Every function accepts an optional `RoutingContext` so tests (and future
 * per-tenant setups) can inject providers / routing / task profiles instead of
 * the centralized defaults in `config/`.
 *
 * ADR: docs/decisions/2026-09-25-centralize-agent-configuration-and-model-routing.md
 */

import type { LanguageModel } from 'ai';

import {
  DEFAULT_ROUTING_PROFILE,
  PROVIDER_REGISTRY,
  REASONING_TIERS,
  ROUTING_PROFILES,
  TASK_PROFILES,
  maxReasoning,
  type ModelRef,
  type ProviderName,
  type ProviderRegistry,
  type ReasoningTier,
  type RoutingProfile,
  type RoutingTable,
  type TaskProfiles,
  type TaskType,
} from './config/index.js';
import { NoAvailableModelError, NoCompliantModelError } from './errors.js';

/** Injectable routing configuration. Defaults to the centralized config. */
export interface RoutingContext {
  registry?: ProviderRegistry;
  /** Named routing profile from `ROUTING_PROFILES`. Ignored when `routing` is given. */
  routingProfile?: RoutingProfile;
  /** Explicit routing table (tests, per-tenant overrides). */
  routing?: RoutingTable;
  taskProfiles?: TaskProfiles;
}

/** A routed model resolved to a concrete adapter, with its identity for audit. */
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

function routingTable({ routing, routingProfile = DEFAULT_ROUTING_PROFILE }: RoutingContext): RoutingTable {
  return routing ?? ROUTING_PROFILES[routingProfile];
}

/**
 * Effective tier = the HIGHER of the task's minimum tier and the caller's
 * optional override. Callers can escalate but never downgrade.
 */
export function resolveEffectiveTier(
  task: TaskType,
  reasoning?: ReasoningTier,
  taskProfiles: TaskProfiles = TASK_PROFILES,
): ReasoningTier {
  return maxReasoning(taskProfiles[task].reasoning, reasoning);
}

/** PHI routing applies if the caller says so OR the task always handles PHI. */
export function resolveContainsPhi(
  task: TaskType,
  containsPhi: boolean,
  taskProfiles: TaskProfiles = TASK_PROFILES,
): boolean {
  return containsPhi || taskProfiles[task].handlesPhi;
}

export function resolveModel(
  ref: ModelRef<ProviderName>,
  registry: ProviderRegistry = PROVIDER_REGISTRY,
): ResolvedModel {
  if (ref.deprecated) {
    throw new Error(`Model "${ref.provider}/${ref.key}" is deprecated. Remove it from routing.`);
  }
  const provider = registry[ref.provider];
  return {
    provider: ref.provider,
    modelKey: ref.key,
    modelId: ref.id,
    baa: provider.baa,
    model: provider.createModel(ref.id),
  };
}

/**
 * Ordered fallback chain for a tier: deprecated models are skipped and, when
 * `containsPhi` is true, non-BAA providers are removed.
 *
 * Throws NoCompliantModelError (PHI) or NoAvailableModelError when empty, so
 * callers never receive an empty chain.
 */
export function getFallbackChain(tier: ReasoningTier, options: FallbackChainOptions): ResolvedModel[] {
  const registry = options.registry ?? PROVIDER_REGISTRY;
  const usable = routingTable(options)[tier].filter((ref) => !ref.deprecated);
  const allowed = options.containsPhi ? usable.filter((ref) => registry[ref.provider].baa) : usable;

  if (allowed.length === 0) {
    throw options.containsPhi ? new NoCompliantModelError(tier) : new NoAvailableModelError(tier);
  }

  return allowed.map((ref) => resolveModel(ref, registry));
}

/** The PRIMARY (first eligible) model for a task at its effective tier. */
export function getModelForTask(
  task: TaskType,
  options: FallbackChainOptions & { reasoning?: ReasoningTier },
): ResolvedModel {
  const tier = resolveEffectiveTier(task, options.reasoning, options.taskProfiles);
  const containsPhi = resolveContainsPhi(task, options.containsPhi, options.taskProfiles);
  const [primary] = getFallbackChain(tier, { ...options, containsPhi });
  // Unreachable: getFallbackChain throws instead of returning an empty chain.
  if (!primary) throw new NoAvailableModelError(tier);
  return primary;
}

export interface RoutingInfoEntry {
  provider: ProviderName;
  providerDisplayName: string;
  baa: boolean;
  modelKey: string;
  modelId: string;
  modelLabel: string;
  modelDescription: string;
  deprecated: boolean;
}

/**
 * Configured chain for a tier (unfiltered). Safe for the frontend: contains
 * no keys and no adapters.
 */
export function getRoutingInfo(tier: ReasoningTier, context: RoutingContext = {}): RoutingInfoEntry[] {
  const registry = context.registry ?? PROVIDER_REGISTRY;
  return routingTable(context)[tier].map((ref) => ({
    provider: ref.provider,
    providerDisplayName: registry[ref.provider].displayName,
    baa: registry[ref.provider].baa,
    modelKey: ref.key,
    modelId: ref.id,
    modelLabel: ref.label,
    modelDescription: ref.description,
    deprecated: ref.deprecated ?? false,
  }));
}

/** Every tier's chain, lowest → highest — e.g. for an admin/settings screen. */
export function getRoutingOverview(
  context: RoutingContext = {},
): { tier: ReasoningTier; models: RoutingInfoEntry[] }[] {
  return REASONING_TIERS.map((tier) => ({ tier, models: getRoutingInfo(tier, context) }));
}
