/**
 * Agent Gateway — the single entry-point for all LLM calls.
 *
 * Features:
 *   • Automatic model routing via config.ts → router.ts
 *   • Automatic fallback: if the primary model errors, the gateway
 *     retries with the next model in the tier's fallback chain.
 *   • Structured-object output via Zod schemas.
 *
 * ADR: docs/decisions/2026-09-25-adopt-vercel-ai-sdk-for-agent-orchestration.md
 * ADR: docs/decisions/2026-09-25-centralize-agent-configuration-and-model-routing.md
 */

import { generateText, streamText, Output, type ModelMessage, type Tool } from 'ai';
import {
  getModelForTask,
  getFallbackChain,
  type TaskComplexity,
  type TaskType,
} from './router.js';
import { TASK_TIER_MAP, type ReasoningTier } from './config/index.js';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Public interfaces
// ─────────────────────────────────────────────────────────────

export interface ExecuteAgentParams {
  taskType: TaskType;
  complexity: TaskComplexity;
  messages: ModelMessage[];
  instructions?: string;
  tools?: Record<string, Tool>;
  maxSteps?: number;
  /** When true, skips automatic fallback and errors immediately. */
  disableFallback?: boolean;
}

export interface ExecuteAgentObjectParams<T> extends ExecuteAgentParams {
  schema: z.Schema<T>;
}

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

/** Resolve the effective tier (higher of task-implied vs explicit). */
function resolveEffectiveTier(taskType: TaskType, complexity: TaskComplexity): ReasoningTier {
  const tierRank: Record<ReasoningTier, number> = { low: 0, medium: 1, high: 2 };
  const impliedTier = TASK_TIER_MAP[taskType];
  return tierRank[complexity] >= tierRank[impliedTier] ? complexity : impliedTier;
}

// ─────────────────────────────────────────────────────────────
// Gateway functions
// ─────────────────────────────────────────────────────────────

/**
 * Execute an agent task with automatic fallback.
 *
 * Tries each model in the tier's fallback chain until one succeeds.
 * If all models fail, throws the last error.
 */
export async function executeAgentTask({
  taskType,
  complexity,
  messages,
  instructions,
  tools,
  maxSteps,
  disableFallback = false,
}: ExecuteAgentParams): Promise<unknown> {
  const tier = resolveEffectiveTier(taskType, complexity);
  const chain = disableFallback
    ? [getModelForTask(taskType, complexity)]
    : getFallbackChain(tier);

  let lastError: Error | undefined;

  for (const model of chain) {
    try {
      const result = await generateText({
        model,
        instructions,
        messages,
        tools,
        ...(maxSteps ? { maxSteps } : {}),
      } as unknown as Parameters<typeof generateText>[0]);

      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Continue to next model in the fallback chain
    }
  }

  throw lastError ?? new Error(`All models failed for tier "${tier}".`);
}

/**
 * Stream an agent task response.
 *
 * Streaming does not support automatic retry mid-stream, so this
 * uses the primary model only. If it fails, the caller should
 * catch and retry with explicit complexity escalation.
 */
export async function streamAgentTask({
  taskType,
  complexity,
  messages,
  instructions,
  tools,
  maxSteps,
}: ExecuteAgentParams): Promise<unknown> {
  const model = getModelForTask(taskType, complexity);

  const result = streamText({
    model,
    instructions,
    messages,
    tools,
    ...(maxSteps ? { maxSteps } : {}),
  } as unknown as Parameters<typeof streamText>[0]);

  return result;
}

/**
 * Execute a structured-object agent task with automatic fallback.
 *
 * Returns the parsed object matching the provided Zod schema.
 * Falls back through the tier's chain on failure.
 */
export async function executeAgentObject<T>({
  taskType,
  complexity,
  messages,
  instructions,
  schema,
  disableFallback = false,
}: ExecuteAgentObjectParams<T>): Promise<unknown> {
  const tier = resolveEffectiveTier(taskType, complexity);
  const chain = disableFallback
    ? [getModelForTask(taskType, complexity)]
    : getFallbackChain(tier);

  let lastError: Error | undefined;

  for (const model of chain) {
    try {
      const result = await generateText({
        model,
        instructions,
        messages,
        output: Output.object({ schema }),
      } as unknown as Parameters<typeof generateText>[0]);

      return (result as unknown as { output: T }).output;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error(`All models failed for tier "${tier}" (object output).`);
}
