/**
 * Gateway error types and the retry/fallback classifier.
 *
 * PHI rule: error messages built here contain only routing metadata
 * (tier, hosting target, endpoint, model, attempt counts) — never prompt or output content.
 */

import {
  APICallError,
  InvalidPromptError,
  JSONParseError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  RetryError,
  StreamProviderError,
  TypeValidationError,
} from 'ai';
import type { ModelCapability, ReasoningTier } from '../config/index.js';

/**
 * Thrown when a call is flagged `containsPhi: true` but no model in the
 * tier's chain is hosted on a BAA-covered endpoint. No model is called.
 */
export class NoCompliantModelError extends Error {
  override readonly name = 'NoCompliantModelError';
  readonly tier: ReasoningTier;
  readonly hostingTarget: string;

  constructor(tier: ReasoningTier, hostingTarget: string) {
    super(
      `No BAA-covered model is available for tier "${tier}" on hosting "${hostingTarget}". ` +
        'Calls containing PHI may only be routed to endpoints with baa: true.',
    );
    this.tier = tier;
    this.hostingTarget = hostingTarget;
  }
}

/**
 * Thrown when models are hosted for the call but none has every capability in
 * `requires` (e.g. vision). No model is called.
 */
export class NoCapableModelError extends Error {
  override readonly name = 'NoCapableModelError';
  readonly tier: ReasoningTier;
  readonly hostingTarget: string;
  readonly requiredCapabilities: readonly ModelCapability[];

  constructor(tier: ReasoningTier, hostingTarget: string, requiredCapabilities: readonly ModelCapability[]) {
    super(
      `No model for tier "${tier}" on hosting "${hostingTarget}" supports all of: ` +
        `${requiredCapabilities.join(', ')}.`,
    );
    this.tier = tier;
    this.hostingTarget = hostingTarget;
    this.requiredCapabilities = requiredCapabilities;
  }
}

/** Thrown when a tier (or model pin) has no usable (non-deprecated, hosted) model at all. */
export class NoAvailableModelError extends Error {
  override readonly name = 'NoAvailableModelError';
  readonly tier: ReasoningTier;
  readonly hostingTarget: string;

  constructor(tier: ReasoningTier, hostingTarget: string) {
    super(`No usable model for tier "${tier}" on hosting "${hostingTarget}".`);
    this.tier = tier;
    this.hostingTarget = hostingTarget;
  }
}

/**
 * Thrown by the gateway when the model finished with `content-filter` — how
 * the AI SDK surfaces a refusal (Anthropic `refusal`, OpenAI / Azure
 * `content_filter`). Carries no model output. Never retried on another model.
 */
export class ModelRefusalError extends Error {
  override readonly name = 'ModelRefusalError';

  constructor() {
    super('The model refused or filtered the request (finish reason "content-filter").');
  }
}

/**
 * Why an agent run failed, for audit and dashboards. Derived from error
 * types and finish reasons only — never from error messages (which may embed PHI).
 *
 * - `input`       the agent's input schema rejected the input (no model called)
 * - `no-model`    routing left no model: none hosted, capable or BAA-covered (no model called)
 * - `refusal`     the model refused / content filter (never retried on another model)
 * - `validation`  the output failed the schema, or the SDK rejected the prompt
 * - `timeout`     an attempt timed out or the call's deadline was spent
 * - `aborted`     the caller cancelled
 * - `provider`    the provider returned an error (HTTP / network / stream)
 * - `unknown`     anything else
 */
export type AgentFailureKind =
  | 'input'
  | 'no-model'
  | 'refusal'
  | 'validation'
  | 'timeout'
  | 'aborted'
  | 'provider'
  | 'unknown';

/**
 * Thrown by the gateway when a model call fails (after fallback, if any).
 *
 * Carries the audit metadata of the failed execution. The underlying SDK error
 * is available as `cause`; do NOT log `cause` verbatim — some SDK errors
 * (e.g. NoObjectGeneratedError.text) embed model output that may contain PHI.
 */
export class AgentExecutionError extends Error {
  override readonly name = 'AgentExecutionError';
  readonly agentExecutionId: string;
  readonly tier: ReasoningTier;
  readonly hostingTarget: string;
  readonly attempts: number;
  readonly lastEndpoint: string;
  readonly lastModelId: string;
  /** Whether the final error was classified as transient (i.e. the chain was exhausted). */
  readonly retryable: boolean;
  /** PHI-free failure category. Defaults to `classifyModelError(cause)`. */
  readonly failureKind: AgentFailureKind;
  /** True when the call's overall deadline was spent (remaining models were not tried). */
  readonly deadlineExceeded: boolean;

  constructor(args: {
    agentExecutionId: string;
    tier: ReasoningTier;
    hostingTarget: string;
    attempts: number;
    lastEndpoint: string;
    lastModelId: string;
    retryable: boolean;
    cause: unknown;
    failureKind?: AgentFailureKind;
    deadlineExceeded?: boolean;
  }) {
    const deadlineExceeded = args.deadlineExceeded ?? false;
    const reason = deadlineExceeded
      ? 'deadline exceeded, remaining models not tried'
      : args.retryable
        ? 'transient error, fallback chain exhausted'
        : 'non-retryable error';
    super(
      `Agent execution ${args.agentExecutionId} failed after ${args.attempts} attempt(s); ` +
        `last model ${args.lastEndpoint}/${args.lastModelId} (${reason}).`,
      { cause: args.cause },
    );
    this.agentExecutionId = args.agentExecutionId;
    this.tier = args.tier;
    this.hostingTarget = args.hostingTarget;
    this.attempts = args.attempts;
    this.lastEndpoint = args.lastEndpoint;
    this.lastModelId = args.lastModelId;
    this.retryable = args.retryable;
    this.failureKind = args.failureKind ?? classifyModelError(args.cause);
    this.deadlineExceeded = deadlineExceeded;
  }
}

function hasErrorName(error: unknown, name: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === name
  );
}

/** Reads `error.code` from a parsed provider error body without touching anything else. */
function providerErrorCode(data: unknown): unknown {
  if (typeof data !== 'object' || data === null || !('error' in data)) return undefined;
  const inner = data.error;
  return typeof inner === 'object' && inner !== null && 'code' in inner ? inner.code : undefined;
}

/**
 * Did the model (or the provider's safety filter) refuse? Refusals surface as
 * finish reason `content-filter`: our ModelRefusalError, or a
 * NoObjectGeneratedError when structured output was refused. Azure OpenAI
 * also rejects filtered prompts up front with HTTP 400 `code: "content_filter"`.
 */
export function isRefusalError(error: unknown): boolean {
  if (error instanceof ModelRefusalError) return true;
  if (RetryError.isInstance(error)) return isRefusalError(error.lastError);
  if (NoObjectGeneratedError.isInstance(error)) return error.finishReason === 'content-filter';
  if (APICallError.isInstance(error)) return providerErrorCode(error.data) === 'content_filter';
  return false;
}

/**
 * Pure, PHI-free failure category for a model-call error (see AgentFailureKind).
 * Uses error types, finish reasons and provider error codes only — never messages.
 */
export function classifyModelError(error: unknown): AgentFailureKind {
  if (isRefusalError(error)) return 'refusal';
  if (RetryError.isInstance(error)) {
    return error.reason === 'abort' ? 'aborted' : classifyModelError(error.lastError);
  }
  if (
    NoObjectGeneratedError.isInstance(error) ||
    NoOutputGeneratedError.isInstance(error) ||
    TypeValidationError.isInstance(error) ||
    JSONParseError.isInstance(error) ||
    InvalidPromptError.isInstance(error)
  ) {
    return 'validation';
  }
  if (APICallError.isInstance(error) || StreamProviderError.isInstance(error)) return 'provider';
  if (hasErrorName(error, 'TimeoutError')) return 'timeout';
  if (hasErrorName(error, 'AbortError')) return 'aborted';
  return 'unknown';
}

/**
 * Pure classifier: should the gateway fall back to the next model?
 *
 * Retryable (transient): HTTP 408/409/429/5xx (incl. Anthropic 529 "overloaded"),
 * network failures (the SDK wraps these as retryable APICallErrors), provider
 * stream errors flagged retryable, and timeouts (`TimeoutError`).
 *
 * Non-retryable: refusals (never shopped to another vendor), 400 invalid
 * request, 401/403 auth, 404, schema/validation errors (NoObjectGeneratedError,
 * TypeValidationError, InvalidPromptError, ...), aborts, and anything
 * unrecognised. Unknown errors fail closed (no fallback) so a request is never
 * fanned out to further vendors on an unexpected error.
 */
export function isRetryableModelError(error: unknown): boolean {
  // Explicit, first: a refusal must never reach a second model.
  if (isRefusalError(error)) return false;

  if (RetryError.isInstance(error)) {
    // The SDK already retried the same model. Aborts are caller-initiated;
    // otherwise classify by the final underlying error.
    if (error.reason === 'abort') return false;
    return isRetryableModelError(error.lastError);
  }

  if (APICallError.isInstance(error)) return error.isRetryable;
  if (StreamProviderError.isInstance(error)) return error.isRetryable;

  if (hasErrorName(error, 'TimeoutError')) return true;

  return false;
}
