/**
 * Agent Model Router.
 *
 *   task (+ optional reasoning override) → effective tier
 *   routing profile[tier]                → ordered logical models
 *   hosting target                       → endpoint + id per model (unhosted models skipped)
 *   containsPhi                          → keep only BAA-covered endpoints
 *
 * Every function accepts an optional `RoutingContext` so tests (and future
 * per-tenant setups) can inject a hosting target / routing / task profiles.
 *
 * ADR: docs/decisions/2026-09-25-centralize-agent-configuration-and-model-routing.md
 */

import type { LanguageModel } from 'ai';

import {
  DEFAULT_HOSTING_TARGET,
  DEFAULT_ROUTING_PROFILE,
  REASONING_TIERS,
  ROUTING_PROFILES,
  TASK_PROFILES,
  maxReasoning,
  type HostingTarget,
  type ModelRef,
  type ModelVendor,
  type ReasoningTier,
  type RoutingProfile,
  type RoutingTable,
  type TaskProfiles,
  type TaskType,
} from './config/index.js';
import { NoAvailableModelError, NoCompliantModelError } from './errors.js';

/** Injectable routing configuration. Defaults to the centralized config. */
export interface RoutingContext {
  /** Where models are served from. Defaults to `direct` vendor APIs. */
  hosting?: HostingTarget;
  /** Named routing profile from `ROUTING_PROFILES`. Ignored when `routing` is given. */
  routingProfile?: RoutingProfile;
  /** Explicit routing table (tests, per-tenant overrides). */
  routing?: RoutingTable;
  taskProfiles?: TaskProfiles;
}

/** A logical model resolved on a hosting target, with its identity for audit. */
export interface ResolvedModel {
  hostingTarget: string;
  endpoint: string;
  modelName: string;
  modelId: string;
  baa: boolean;
  model: LanguageModel;
}

export interface FallbackChainOptions extends RoutingContext {
  /** When true, the chain is restricted to BAA-covered endpoints. */
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

interface Candidate {
  ref: ModelRef;
  endpointName: string;
  modelId: string;
  baa: boolean;
  createModel: (modelId: string) => LanguageModel;
}

/** Logical model → endpoint on the target, or undefined if the target does not host it. */
function locate(ref: ModelRef, hosting: HostingTarget): Candidate | undefined {
  const binding = hosting.models[ref.name];
  if (!binding) return undefined;
  const endpoint = hosting.endpoints[binding.endpoint];
  if (!endpoint) return undefined;
  return {
    ref,
    endpointName: binding.endpoint,
    modelId: binding.id,
    baa: endpoint.baa,
    createModel: endpoint.createModel,
  };
}

/**
 * Ordered fallback chain for a tier on the active hosting target: deprecated
 * and unhosted models are skipped and, when `containsPhi` is true, non-BAA
 * endpoints are removed.
 *
 * Throws NoCompliantModelError (PHI) or NoAvailableModelError when empty, so
 * callers never receive an empty chain.
 */
export function getFallbackChain(tier: ReasoningTier, options: FallbackChainOptions): ResolvedModel[] {
  const hosting = options.hosting ?? DEFAULT_HOSTING_TARGET;
  const available = routingTable(options)[tier]
    .filter((ref) => !ref.deprecated)
    .map((ref) => locate(ref, hosting))
    .filter((c): c is Candidate => c !== undefined);
  const allowed = options.containsPhi ? available.filter((c) => c.baa) : available;

  if (allowed.length === 0) {
    throw options.containsPhi
      ? new NoCompliantModelError(tier, hosting.name)
      : new NoAvailableModelError(tier, hosting.name);
  }

  return allowed.map((c) => ({
    hostingTarget: hosting.name,
    endpoint: c.endpointName,
    modelName: c.ref.name,
    modelId: c.modelId,
    baa: c.baa,
    model: c.createModel(c.modelId),
  }));
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
  if (!primary) throw new NoAvailableModelError(tier, options.hosting?.name ?? DEFAULT_HOSTING_TARGET.name);
  return primary;
}

export interface RoutingInfoEntry {
  modelName: string;
  modelLabel: string;
  modelDescription: string;
  vendor: ModelVendor;
  deprecated: boolean;
  /** Whether the active hosting target serves this model. */
  available: boolean;
  endpoint?: string;
  endpointDisplayName?: string;
  modelId?: string;
  baa: boolean;
}

/**
 * Configured chain for a tier on the active hosting target (unfiltered).
 * Safe for the frontend: contains no keys and no adapters.
 */
export function getRoutingInfo(tier: ReasoningTier, context: RoutingContext = {}): RoutingInfoEntry[] {
  const hosting = context.hosting ?? DEFAULT_HOSTING_TARGET;
  return routingTable(context)[tier].map((ref) => {
    const located = locate(ref, hosting);
    return {
      modelName: ref.name,
      modelLabel: ref.label,
      modelDescription: ref.description,
      vendor: ref.vendor,
      deprecated: ref.deprecated ?? false,
      available: located !== undefined,
      endpoint: located?.endpointName,
      endpointDisplayName: located ? hosting.endpoints[located.endpointName]?.displayName : undefined,
      modelId: located?.modelId,
      baa: located?.baa ?? false,
    };
  });
}

/** Every tier's chain, lowest → highest — e.g. for an admin/settings screen. */
export function getRoutingOverview(
  context: RoutingContext = {},
): { tier: ReasoningTier; models: RoutingInfoEntry[] }[] {
  return REASONING_TIERS.map((tier) => ({ tier, models: getRoutingInfo(tier, context) }));
}
