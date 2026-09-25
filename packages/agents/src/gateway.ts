/**
 * Agent Gateway — the single entry-point for all LLM calls.
 *
 * Features:
 *   • Model routing via config/ → router.ts (effective tier = max(task, requested)).
 *   • PHI guard: `containsPhi` is REQUIRED. PHI calls are routed only to
 *     providers whose catalog has `baa: true`; if none, NoCompliantModelError
 *     is thrown before any model is called.
 *   • Fallback only on transient failures (429 / 5xx / overloaded / network /
 *     timeout). Non-retryable errors (400, 401/403, schema/validation, ...)
 *     fail immediately so a request is never fanned out to extra vendors.
 *   • Audit traceability: every call gets an `agentExecutionId` and reports
 *     which provider/model served it and how many models were attempted.
 *     Callers write this metadata to @repo/audit.
 *   • Prompts and outputs are NEVER logged here.
 *
 * ADR: docs/decisions/2026-09-25-adopt-vercel-ai-sdk-for-agent-orchestration.md
 * ADR: docs/decisions/2026-09-25-centralize-agent-configuration-and-model-routing.md
 */

import {
  generateText,
  isStepCount,
  Output,
  streamText,
  type FlexibleSchema,
  type ModelMessage,
  type ToolSet,
} from 'ai';

import type { ProviderName } from './config/index.js';
import { AgentExecutionError, isRetryableModelError } from './errors.js';
import {
  getFallbackChain,
  resolveEffectiveTier,
  type ReasoningTier,
  type ResolvedModel,
  type RoutingContext,
  type TaskComplexity,
  type TaskType,
} from './router.js';

// ─────────────────────────────────────────────────────────────
// Public interfaces
// ─────────────────────────────────────────────────────────────

export interface AgentCallParams {
  taskType: TaskType;
  complexity: TaskComplexity;
  /**
   * REQUIRED. Whether `messages` / `instructions` contain PHI. When true the
   * call is only routed to providers with a signed BAA.
   */
  containsPhi: boolean;
  messages: ModelMessage[];
  instructions?: string;
  /** When true, only the first eligible model is tried (no fallback). */
  disableFallback?: boolean;
  /** Caller cancellation. An aborted call is never retried on another model. */
  abortSignal?: AbortSignal;
}

export interface ExecuteAgentParams extends AgentCallParams {
  tools?: ToolSet;
  /** Maximum tool-loop steps. Mapped to the SDK's `stopWhen: isStepCount(n)`. */
  maxSteps?: number;
}

export interface ExecuteAgentObjectParams<T> extends AgentCallParams {
  /** Zod (or any SDK-supported) schema describing the structured output. */
  schema: FlexibleSchema<T>;
}

export interface StreamAgentParams extends ExecuteAgentParams {
  /**
   * Called on stream errors. Defaults to a no-op: the SDK default is
   * `console.error(error)`, and provider errors can embed the request body (PHI).
   * Errors still surface to whoever consumes the stream.
   */
  onError?: (error: unknown) => void;
}

/** Audit metadata returned with every gateway result. Contains no PHI. */
export interface AgentExecutionMeta {
  agentExecutionId: string;
  tier: ReasoningTier;
  containsPhi: boolean;
  /** Provider that actually served the call. */
  provider: ProviderName;
  modelKey: string;
  modelId: string;
  /** Number of models attempted (1 = primary succeeded). SDK-internal same-model retries are not counted. */
  attempts: number;
}

export type AgentTextResult = Awaited<ReturnType<typeof generateText<ToolSet>>>;
export type AgentStreamResult = ReturnType<typeof streamText<ToolSet>>;

export interface AgentTaskResult extends AgentExecutionMeta {
  result: AgentTextResult;
}

export interface AgentObjectResult<T> extends AgentExecutionMeta {
  output: T;
}

export interface AgentStreamTaskResult extends AgentExecutionMeta {
  result: AgentStreamResult;
}

export interface GatewayOptions extends RoutingContext {
  /**
   * SDK-level retries against the SAME model (with backoff) before the gateway
   * falls back to the next model. Defaults to the SDK default (2).
   */
  maxRetriesPerModel?: number;
  /** Generator for `agentExecutionId`. Defaults to Web Crypto `crypto.randomUUID()` (global in Node >= 19). */
  generateExecutionId?: () => string;
}

export interface Gateway {
  executeAgentTask(params: ExecuteAgentParams): Promise<AgentTaskResult>;
  executeAgentObject<T>(params: ExecuteAgentObjectParams<T>): Promise<AgentObjectResult<T>>;
  streamAgentTask(params: StreamAgentParams): AgentStreamTaskResult;
}

// ─────────────────────────────────────────────────────────────
// Gateway factory
// ─────────────────────────────────────────────────────────────

const noop = (): void => {};

/**
 * Creates a gateway bound to a registry / routing table. The module-level
 * functions below use the centralized config; tests inject mock providers.
 */
export function createGateway(options: GatewayOptions = {}): Gateway {
  const { maxRetriesPerModel, generateExecutionId = () => crypto.randomUUID(), ...routingContext } = options;

  function plan(params: AgentCallParams) {
    const tier = resolveEffectiveTier(
      params.taskType,
      params.complexity,
      routingContext.taskTierMap,
    );
    const chain = getFallbackChain(tier, { ...routingContext, containsPhi: params.containsPhi });
    return {
      agentExecutionId: generateExecutionId(),
      tier,
      chain: params.disableFallback ? chain.slice(0, 1) : chain,
    };
  }

  function meta(
    base: { agentExecutionId: string; tier: ReasoningTier },
    containsPhi: boolean,
    served: ResolvedModel,
    attempts: number,
  ): AgentExecutionMeta {
    return {
      agentExecutionId: base.agentExecutionId,
      tier: base.tier,
      containsPhi,
      provider: served.provider,
      modelKey: served.modelKey,
      modelId: served.modelId,
      attempts,
    };
  }

  /** Tries each model in order; falls back only on retryable errors. */
  async function runWithFallback<R>(
    params: AgentCallParams,
    call: (model: ResolvedModel) => Promise<R>,
  ): Promise<{ value: R } & AgentExecutionMeta> {
    const planned = plan(params);
    let attempts = 0;

    for (const candidate of planned.chain) {
      attempts += 1;
      try {
        const value = await call(candidate);
        return { value, ...meta(planned, params.containsPhi, candidate, attempts) };
      } catch (err) {
        const retryable = isRetryableModelError(err);
        const isLast = attempts === planned.chain.length;
        if (!retryable || isLast || params.abortSignal?.aborted === true) {
          throw new AgentExecutionError({
            agentExecutionId: planned.agentExecutionId,
            attempts,
            lastProvider: candidate.provider,
            lastModelId: candidate.modelId,
            retryable,
            cause: err,
          });
        }
        // Transient failure: fall through to the next (already compliance-filtered) model.
      }
    }

    // Unreachable: getFallbackChain never returns an empty chain.
    throw new Error(`Empty fallback chain for tier "${planned.tier}".`);
  }

  return {
    async executeAgentTask(params) {
      const { value, ...execution } = await runWithFallback(params, ({ model }) =>
        generateText<ToolSet>({
          model,
          instructions: params.instructions,
          messages: params.messages,
          tools: params.tools,
          stopWhen: params.maxSteps === undefined ? undefined : isStepCount(params.maxSteps),
          maxRetries: maxRetriesPerModel,
          abortSignal: params.abortSignal,
        }),
      );
      return { ...execution, result: value };
    },

    async executeAgentObject<T>(params: ExecuteAgentObjectParams<T>) {
      const { value, ...execution } = await runWithFallback(params, async ({ model }) => {
        const result = await generateText({
          model,
          instructions: params.instructions,
          messages: params.messages,
          output: Output.object({ schema: params.schema }),
          maxRetries: maxRetriesPerModel,
          abortSignal: params.abortSignal,
        });
        return result.output;
      });
      return { ...execution, output: value };
    },

    /**
     * Streaming cannot transparently fail over mid-stream, so only the first
     * eligible (compliance-filtered) model is used; `attempts` is always 1.
     */
    streamAgentTask(params) {
      const planned = plan({ ...params, disableFallback: true });
      const [primary] = planned.chain;
      if (!primary) throw new Error(`Empty fallback chain for tier "${planned.tier}".`);

      const result = streamText<ToolSet>({
        model: primary.model,
        instructions: params.instructions,
        messages: params.messages,
        tools: params.tools,
        stopWhen: params.maxSteps === undefined ? undefined : isStepCount(params.maxSteps),
        maxRetries: maxRetriesPerModel,
        abortSignal: params.abortSignal,
        onError: ({ error }) => (params.onError ?? noop)(error),
      });
      return { ...meta(planned, params.containsPhi, primary, 1), result };
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Default gateway (centralized config)
// ─────────────────────────────────────────────────────────────

const defaultGateway = createGateway();

/**
 * Execute an agent task. Falls back through the (BAA-filtered) chain on
 * transient errors only; throws AgentExecutionError otherwise.
 */
export function executeAgentTask(params: ExecuteAgentParams): Promise<AgentTaskResult> {
  return defaultGateway.executeAgentTask(params);
}

/** Execute a structured-output task; resolves to the schema-typed `output` plus audit metadata. */
export function executeAgentObject<T>(
  params: ExecuteAgentObjectParams<T>,
): Promise<AgentObjectResult<T>> {
  return defaultGateway.executeAgentObject(params);
}

/** Stream an agent task on the primary eligible model (no fallback). */
export function streamAgentTask(params: StreamAgentParams): AgentStreamTaskResult {
  return defaultGateway.streamAgentTask(params);
}
