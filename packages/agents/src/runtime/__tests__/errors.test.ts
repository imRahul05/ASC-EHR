import {
  generateText,
  InvalidPromptError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  RetryError,
  TypeValidationError,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { classifyModelError, isRefusalError, isRetryableModelError, ModelRefusalError } from '../errors.js';
import { apiError, refuse, respondWith } from '../../testing/fixtures.js';

/** Produces a real NoObjectGeneratedError from the SDK (model returns non-JSON). */
async function realNoObjectGeneratedError(): Promise<unknown> {
  return generateText({
    model: new MockLanguageModelV4({ doGenerate: respondWith('not json') }),
    prompt: 'synthetic',
    output: Output.object({ schema: z.object({ a: z.string() }) }),
  }).catch((e: unknown) => e);
}

/**
 * A real NoObjectGeneratedError for a refused structured output (finish reason
 * `content-filter`). The SDK throws it lazily, when `output` is read.
 */
async function realRefusedObjectError(): Promise<unknown> {
  const error = await generateText({
    model: new MockLanguageModelV4({ doGenerate: refuse() }),
    prompt: 'synthetic',
    output: Output.object({ schema: z.object({ a: z.string() }) }),
  })
    .then((result) => result.output)
    .catch((e: unknown) => e);
  expect(NoObjectGeneratedError.isInstance(error)).toBe(true);
  return error;
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

  it('refusals are NOT retryable (never shopped to another vendor)', async () => {
    expect(isRetryableModelError(new ModelRefusalError())).toBe(false);
    expect(isRetryableModelError(await realRefusedObjectError())).toBe(false);
  });

  it('unknown errors fail closed (no fallback)', () => {
    expect(isRetryableModelError(new Error('boom'))).toBe(false);
    expect(isRetryableModelError('boom')).toBe(false);
    expect(isRetryableModelError(undefined)).toBe(false);
  });
});

describe('classifyModelError (PHI-free failure kind)', () => {
  it('refusals: content-filter finish, refused structured output, Azure content_filter 400', async () => {
    const azureFiltered = apiError(400);
    Object.defineProperty(azureFiltered, 'data', { value: { error: { code: 'content_filter' } } });

    expect(classifyModelError(new ModelRefusalError())).toBe('refusal');
    expect(classifyModelError(await realRefusedObjectError())).toBe('refusal');
    expect(classifyModelError(azureFiltered)).toBe('refusal');
    expect(isRefusalError(azureFiltered)).toBe(true);
    expect(isRefusalError(apiError(400))).toBe(false);
  });

  it('validation, provider, timeout, aborted and unknown', async () => {
    expect(classifyModelError(await realNoObjectGeneratedError())).toBe('validation');
    expect(classifyModelError(new NoOutputGeneratedError())).toBe('validation');
    expect(classifyModelError(new TypeValidationError({ value: {}, cause: new Error('bad') }))).toBe('validation');
    expect(classifyModelError(apiError(429))).toBe('provider');
    expect(classifyModelError(apiError(400))).toBe('provider');
    expect(classifyModelError(new DOMException('timed out', 'TimeoutError'))).toBe('timeout');
    expect(classifyModelError(new DOMException('aborted', 'AbortError'))).toBe('aborted');
    expect(classifyModelError(new RetryError({ message: 'x', reason: 'abort', errors: [apiError(503)] }))).toBe(
      'aborted',
    );
    expect(
      classifyModelError(new RetryError({ message: 'x', reason: 'maxRetriesExceeded', errors: [apiError(503)] })),
    ).toBe('provider');
    expect(classifyModelError(new Error('boom'))).toBe('unknown');
  });
});
