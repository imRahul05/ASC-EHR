/**
 * Gateway error types and the retry/fallback classifier.
 *
 * PHI rule: error messages built here contain only routing metadata
 * (tier, provider, model, attempt counts) — never prompt or output content.
 */

import { APICallError, RetryError, StreamProviderError } from 'ai';
import type { ProviderName, ReasoningTier } from './config/index.js';

/**
 * Thrown when a call is flagged `containsPhi: true` but no model in the
 * tier's chain belongs to a provider with a signed BAA. No model is called.
 */
export class NoCompliantModelError extends Error {
  override readonly name = 'NoCompliantModelError';
  readonly tier: ReasoningTier;

  constructor(tier: ReasoningTier) {
    super(
      `No BAA-covered model is configured for tier "${tier}". ` +
        'Calls containing PHI may only be routed to providers with baa: true.',
    );
    this.tier = tier;
  }
}

/** Thrown when a tier has no usable (non-deprecated) model at all. */
export class NoAvailableModelError extends Error {
  override readonly name = 'NoAvailableModelError';
  readonly tier: ReasoningTier;

  constructor(tier: ReasoningTier) {
    super(`No non-deprecated models available for tier "${tier}".`);
    this.tier = tier;
  }
}

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
  readonly attempts: number;
  readonly lastProvider: ProviderName;
  readonly lastModelId: string;
  /** Whether the final error was classified as transient (i.e. the chain was exhausted). */
  readonly retryable: boolean;

  constructor(args: {
    agentExecutionId: string;
    attempts: number;
    lastProvider: ProviderName;
    lastModelId: string;
    retryable: boolean;
    cause: unknown;
  }) {
    super(
      `Agent execution ${args.agentExecutionId} failed after ${args.attempts} attempt(s); ` +
        `last model ${args.lastProvider}/${args.lastModelId} ` +
        `(${args.retryable ? 'transient error, fallback chain exhausted' : 'non-retryable error'}).`,
      { cause: args.cause },
    );
    this.agentExecutionId = args.agentExecutionId;
    this.attempts = args.attempts;
    this.lastProvider = args.lastProvider;
    this.lastModelId = args.lastModelId;
    this.retryable = args.retryable;
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

/**
 * Pure classifier: should the gateway fall back to the next model?
 *
 * Retryable (transient): HTTP 408/409/429/5xx (incl. Anthropic 529 "overloaded"),
 * network failures (the SDK wraps these as retryable APICallErrors), provider
 * stream errors flagged retryable, and timeouts (`TimeoutError`).
 *
 * Non-retryable: 400 invalid request, 401/403 auth, 404, schema/validation
 * errors (NoObjectGeneratedError, TypeValidationError, InvalidPromptError, ...),
 * aborts, and anything unrecognised. Unknown errors fail closed (no fallback)
 * so a request is never fanned out to further vendors on an unexpected error.
 */
export function isRetryableModelError(error: unknown): boolean {
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
