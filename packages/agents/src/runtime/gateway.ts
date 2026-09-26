/**
 * Agent Gateway — the single entry-point for all LLM calls.
 *
 * Features:
 *   • Model routing via config/ → router.ts (effective tier = max(task minimum, optional override)).
 *     A per-call model pin (`models`) replaces the tier's chain; `requires` drops models
 *     lacking a capability. Hosting, deprecation and BAA filters always apply.
 *   • PHI guard: `containsPhi` is REQUIRED (and forced on for tasks whose
 *     profile has `handlesPhi`). PHI calls are routed only to
 *     endpoints with `baa: true` on the active hosting target; if none, NoCompliantModelError
 *     is thrown before any model is called.
 *   • Fallback only on transient failures (429 / 5xx / overloaded / network /
 *     timeout). Non-retryable errors (400, 401/403, schema/validation, refusal, ...)
 *     fail immediately so a request is never fanned out to extra vendors.
 *   • Latency budget: a per-attempt timeout (a timed-out model falls back) and an
 *     overall deadline (once spent, no further model is tried).
 *   • Stateless providers: each endpoint's mandatory `providerOptions`
 *     (e.g. OpenAI / Azure `store: false`) are sent on every call.
 *   • Audit traceability: every call gets an `agentExecutionId` and reports
 *     which hosting target / endpoint / model served it, how many models were
 *     attempted and the token usage. Callers write this metadata to @asc/audit.
 *   • Prompts and outputs are NEVER logged here, and telemetry never records them.
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
  type LanguageModelUsage,
  type ModelMessage,
  type ToolSet,
} from 'ai';

import {
  DEFAULT_LATENCY_BUDGET,
  TASK_PROFILES,
  type LatencyBudget,
  type ReasoningTier,
  type TaskProfiles,
  type TaskType,
} from '../config/index.js';
import { AgentExecutionError, ModelRefusalError, isRetryableModelError } from './errors.js';
import {
  getFallbackChain,
  resolveContainsPhi,
  resolveEffectiveTier,
  type ModelSelection,
  type ResolvedModel,
  type RoutingContext,
} from './router.js';

// ─────────────────────────────────────────────────────────────
// Public interfaces
// ─────────────────────────────────────────────────────────────

export interface AgentCallParams extends ModelSelection {
  /** What kind of work this is, e.g. `Task.MedicalCoding`. Sets the minimum tier and PHI policy. */
  task: TaskType;
  /** Optional escalation, e.g. `Reasoning.High`. Can raise the task's tier, never lower it. */
  reasoning?: ReasoningTier;
  /**
   * REQUIRED. Whether `messages` / `instructions` contain PHI. When true the
   * call is only routed to providers with a signed BAA. Tasks whose profile has
   * `handlesPhi: true` are always treated as PHI.
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

export interface ExecuteAgentObjectParams<T> extends ExecuteAgentParams {
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

/**
 * Token usage of the model that served the call, summed over its tool-loop
 * steps. Tokens spent by failed attempts on earlier models are not included.
 * A field is undefined when the provider does not report it.
 */
export interface AgentTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  /** Input tokens read from the provider's prompt cache. */
  cachedInputTokens?: number;
  totalTokens?: number;
}

/** Audit metadata returned with every gateway result. Contains no PHI. */
export interface AgentExecutionMeta {
  agentExecutionId: string;
  task: TaskType;
  tier: ReasoningTier;
  /** Effective PHI flag (caller flag OR task policy). */
  containsPhi: boolean;
  /** Where the call was served: hosting target + endpoint (e.g. `direct` / `anthropic`). */
  hostingTarget: string;
  endpoint: string;
  /** Logical model name (e.g. `claudeOpus55`) and the id sent to the endpoint. */
  modelName: string;
  modelId: string;
  /** Number of models attempted (1 = primary succeeded). SDK-internal same-model retries are not counted. */
  attempts: number;
  /** Token usage (text / object calls). Undefined for streams: usage is only known once the stream ends. */
  usage?: AgentTokenUsage;
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

export interface GatewayTelemetryOptions {
  /**
   * Emit AI SDK telemetry (spans / integration events) for gateway calls.
   * Default false. Inputs and outputs are NEVER recorded, whatever this says.
   */
  isEnabled?: boolean;
}

export interface GatewayOptions extends RoutingContext {
  /**
   * SDK-level retries against the SAME model (with backoff, 2s → 4s) before the
   * gateway falls back to the next model. Defaults to the SDK default (2).
   * Interactive apps should use 1 (fail over faster); background workers 2.
   */
  maxRetriesPerModel?: number;
  /**
   * Default latency budget for this gateway. A task profile's `latencyBudget`
   * overrides it per field; unset fields use `DEFAULT_LATENCY_BUDGET` (60s / 120s).
   */
  latencyBudget?: LatencyBudget;
  /** AI SDK telemetry. Off by default; prompts and outputs are never recorded. */
  telemetry?: GatewayTelemetryOptions;
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

/** Aborts with a `TimeoutError` after `ms`. `clear()` cancels the timer once it is no longer needed. */
function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException(`Timed out after ${ms}ms.`, 'TimeoutError'));
  }, ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

/** Combines the gateway's own signals with the caller's (if any). */
function anySignal(signals: readonly AbortSignal[], callerSignal: AbortSignal | undefined): AbortSignal {
  return AbortSignal.any(callerSignal ? [...signals, callerSignal] : [...signals]);
}

function toTokenUsage(usage: LanguageModelUsage): AgentTokenUsage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cachedInputTokens: usage.inputTokenDetails.cacheReadTokens,
    totalTokens: usage.totalTokens,
  };
}

/**
 * Creates a gateway bound to a registry / routing table. The module-level
 * functions below use the centralized config; tests inject a mock hosting target.
 */
export function createGateway(options: GatewayOptions = {}): Gateway {
  const {
    maxRetriesPerModel,
    latencyBudget,
    telemetry,
    generateExecutionId = () => crypto.randomUUID(),
    ...routingContext
  } = options;
  const taskProfiles: TaskProfiles = routingContext.taskProfiles ?? TASK_PROFILES;

  /** Task profile → gateway option → default, per field. */
  function budgetFor(task: TaskType): Required<LatencyBudget> {
    const taskBudget = taskProfiles[task].latencyBudget;
    return {
      attemptTimeoutMs:
        taskBudget?.attemptTimeoutMs ?? latencyBudget?.attemptTimeoutMs ?? DEFAULT_LATENCY_BUDGET.attemptTimeoutMs,
      totalTimeoutMs:
        taskBudget?.totalTimeoutMs ?? latencyBudget?.totalTimeoutMs ?? DEFAULT_LATENCY_BUDGET.totalTimeoutMs,
    };
  }

  /**
   * Settings shared by every SDK call. `recordInputs` / `recordOutputs` are
   * hard-coded false (not configurable): spans must never carry prompts or
   * outputs. `functionId` is the task name — no PHI.
   */
  function sdkSettings(params: AgentCallParams, served: ResolvedModel) {
    return {
      model: served.model,
      providerOptions: served.providerOptions,
      maxRetries: maxRetriesPerModel,
      telemetry: {
        isEnabled: telemetry?.isEnabled ?? false,
        recordInputs: false,
        recordOutputs: false,
        functionId: params.task,
      },
    };
  }

  function plan(params: AgentCallParams) {
    const tier = resolveEffectiveTier(params.task, params.reasoning, taskProfiles);
    const containsPhi = resolveContainsPhi(params.task, params.containsPhi, taskProfiles);
    const chain = getFallbackChain(tier, {
      ...routingContext,
      containsPhi,
      models: params.models,
      requires: params.requires,
    });
    return {
      agentExecutionId: generateExecutionId(),
      task: params.task,
      tier,
      containsPhi,
      chain: params.disableFallback ? chain.slice(0, 1) : chain,
    };
  }

  function meta(
    base: { agentExecutionId: string; task: TaskType; tier: ReasoningTier; containsPhi: boolean },
    served: ResolvedModel,
    attempts: number,
    usage?: AgentTokenUsage,
  ): AgentExecutionMeta {
    return {
      agentExecutionId: base.agentExecutionId,
      task: base.task,
      tier: base.tier,
      containsPhi: base.containsPhi,
      hostingTarget: served.hostingTarget,
      endpoint: served.endpoint,
      modelName: served.modelName,
      modelId: served.modelId,
      attempts,
      ...(usage && { usage }),
    };
  }

  /**
   * Tries each model in order; falls back only on retryable errors (incl. an
   * attempt timeout), and never once the caller aborted or the deadline is spent.
   */
  async function runWithFallback<R>(
    params: AgentCallParams,
    call: (model: ResolvedModel, abortSignal: AbortSignal) => Promise<{ value: R; usage: LanguageModelUsage }>,
  ): Promise<{ value: R } & AgentExecutionMeta> {
    const planned = plan(params);
    const budget = budgetFor(params.task);
    const deadline = timeoutSignal(budget.totalTimeoutMs);
    let attempts = 0;

    try {
      for (const candidate of planned.chain) {
        attempts += 1;
        const attempt = timeoutSignal(budget.attemptTimeoutMs);
        try {
          const { value, usage } = await call(
            candidate,
            anySignal([deadline.signal, attempt.signal], params.abortSignal),
          );
          return { value, ...meta(planned, candidate, attempts, toTokenUsage(usage)) };
        } catch (err) {
          // Decide by which signal fired, not by the error: the SDK may surface
          // a timeout as an AbortError (e.g. when it fires during retry backoff).
          const callerAborted = params.abortSignal?.aborted === true;
          const deadlineExceeded = !callerAborted && deadline.signal.aborted;
          const timedOut = deadlineExceeded || (!callerAborted && attempt.signal.aborted);
          const retryable = !callerAborted && (timedOut || isRetryableModelError(err));
          const isLast = attempts === planned.chain.length;
          if (!retryable || isLast || deadlineExceeded) {
            throw new AgentExecutionError({
              agentExecutionId: planned.agentExecutionId,
              tier: planned.tier,
              hostingTarget: candidate.hostingTarget,
              attempts,
              lastEndpoint: candidate.endpoint,
              lastModelId: candidate.modelId,
              retryable,
              cause: err,
              failureKind: callerAborted ? 'aborted' : timedOut ? 'timeout' : undefined,
              deadlineExceeded,
            });
          }
          // Transient failure: fall through to the next (already compliance-filtered) model.
        } finally {
          attempt.clear();
        }
      }
    } finally {
      deadline.clear();
    }

    // Unreachable: getFallbackChain never returns an empty chain.
    throw new Error(`Empty fallback chain for tier "${planned.tier}".`);
  }

  return {
    async executeAgentTask(params) {
      const { value, ...execution } = await runWithFallback(params, async (served, abortSignal) => {
        const result = await generateText<ToolSet>({
          ...sdkSettings(params, served),
          instructions: params.instructions,
          messages: params.messages,
          tools: params.tools,
          stopWhen: params.maxSteps === undefined ? undefined : isStepCount(params.maxSteps),
          abortSignal,
        });
        // Refusal fails closed: never returned as a result, never retried elsewhere.
        if (result.finishReason === 'content-filter') throw new ModelRefusalError();
        return { value: result, usage: result.usage };
      });
      return { ...execution, result: value };
    },

    async executeAgentObject<T>(params: ExecuteAgentObjectParams<T>) {
      const { value, ...execution } = await runWithFallback(params, async (served, abortSignal) => {
        const result = await generateText({
          ...sdkSettings(params, served),
          instructions: params.instructions,
          messages: params.messages,
          output: Output.object({ schema: params.schema }),
          tools: params.tools,
          stopWhen: params.maxSteps === undefined ? undefined : isStepCount(params.maxSteps),
          abortSignal,
        });
        if (result.finishReason === 'content-filter') throw new ModelRefusalError();
        return { value: result.output, usage: result.usage };
      });
      return { ...execution, output: value };
    },

    /**
     * Streaming cannot transparently fail over mid-stream, so only the first
     * eligible (compliance-filtered) model is used; `attempts` is always 1.
     * The whole stream is bounded by the total deadline; `usage` is not in the
     * metadata (read `result.totalUsage` once the stream ends).
     */
    streamAgentTask(params) {
      const planned = plan({ ...params, disableFallback: true });
      const [primary] = planned.chain;
      if (!primary) throw new Error(`Empty fallback chain for tier "${planned.tier}".`);

      const result = streamText<ToolSet>({
        ...sdkSettings(params, primary),
        instructions: params.instructions,
        messages: params.messages,
        tools: params.tools,
        stopWhen: params.maxSteps === undefined ? undefined : isStepCount(params.maxSteps),
        // AbortSignal.timeout: the stream's end is not observed here, so the timer cannot be cleared.
        abortSignal: anySignal([AbortSignal.timeout(budgetFor(params.task).totalTimeoutMs)], params.abortSignal),
        onError: ({ error }) => (params.onError ?? noop)(error),
      });
      return { ...meta(planned, primary, 1), result };
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Default gateway (centralized config)
// ─────────────────────────────────────────────────────────────

/** Gateway over the centralized config (`direct` hosting, `default` routing profile). */
export const defaultGateway: Gateway = createGateway();

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
