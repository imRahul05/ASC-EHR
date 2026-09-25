import {
  generateText,
  InvalidPromptError,
  NoObjectGeneratedError,
  Output,
  RetryError,
  TypeValidationError,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { isRetryableModelError } from '../errors.js';
import { apiError, respondWith } from '../../testing/fixtures.js';

/** Produces a real NoObjectGeneratedError from the SDK (model returns non-JSON). */
async function realNoObjectGeneratedError(): Promise<unknown> {
  return generateText({
    model: new MockLanguageModelV4({ doGenerate: respondWith('not json') }),
    prompt: 'synthetic',
    output: Output.object({ schema: z.object({ a: z.string() }) }),
  }).catch((e: unknown) => e);
}

describe('isRetryableModelError', () => {
  it.each([408, 409, 429, 500, 502, 503, 529])('HTTP %i is retryable', (status) => {
    expect(isRetryableModelError(apiError(status))).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])('HTTP %i is NOT retryable', (status) => {
    expect(isRetryableModelError(apiError(status))).toBe(false);
  });

  it('network failures (SDK marks them retryable, no status) are retryable', () => {
    expect(isRetryableModelError(apiError(0, true))).toBe(true);
  });

  it('timeouts are retryable, caller aborts are not', () => {
    expect(isRetryableModelError(new DOMException('timed out', 'TimeoutError'))).toBe(true);
    expect(isRetryableModelError(new DOMException('aborted', 'AbortError'))).toBe(false);
  });

  it('classifies RetryError by its final underlying error', () => {
    const exhausted = new RetryError({
      message: 'x',
      reason: 'maxRetriesExceeded',
      errors: [apiError(429), apiError(503)],
    });
    const nonRetryable = new RetryError({
      message: 'x',
      reason: 'errorNotRetryable',
      errors: [apiError(503), apiError(400)],
    });
    const aborted = new RetryError({ message: 'x', reason: 'abort', errors: [apiError(503)] });

    expect(isRetryableModelError(exhausted)).toBe(true);
    expect(isRetryableModelError(nonRetryable)).toBe(false);
    expect(isRetryableModelError(aborted)).toBe(false);
  });

  it('validation / schema / prompt errors are NOT retryable', async () => {
    const noObject = await realNoObjectGeneratedError();
    expect(NoObjectGeneratedError.isInstance(noObject)).toBe(true);
    expect(isRetryableModelError(noObject)).toBe(false);
    expect(isRetryableModelError(new TypeValidationError({ value: {}, cause: new Error('bad') }))).toBe(
      false,
    );
    expect(isRetryableModelError(new InvalidPromptError({ prompt: {}, message: 'bad' }))).toBe(false);
  });

  it('unknown errors fail closed (no fallback)', () => {
    expect(isRetryableModelError(new Error('boom'))).toBe(false);
    expect(isRetryableModelError('boom')).toBe(false);
    expect(isRetryableModelError(undefined)).toBe(false);
  });
});
