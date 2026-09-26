import { createAzure } from '@ai-sdk/azure';
import { createOpenAI } from '@ai-sdk/openai';
import { registerTelemetry, type LanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { AgentCallParams } from '../gateway.js';
import { createGateway } from '../gateway.js';
import { AgentExecutionError, ModelRefusalError } from '../errors.js';
import {
  Reasoning,
  Task,
  TASK_PROFILES,
  createAzureOpenAIEndpoint,
  openaiEndpoint,
  type Endpoint,
  type RoutingTable,
} from '../../config/index.js';
import {
  FixtureModels,
  apiError,
  callCount,
  createFixture,
  createTestGateway,
  failWith,
  hang,
  refuse,
  respondWith,
} from '../../testing/fixtures.js';

const messages: AgentCallParams['messages'] = [{ role: 'user', content: 'synthetic, non-PHI test prompt' }];
const highCall = { task: Task.General, reasoning: Reasoning.High, containsPhi: false, messages } as const;

// ─────────────────────────────────────────────────────────────
// Provider statelessness (store: false)
// ─────────────────────────────────────────────────────────────

/** Every tier routes to one model (`oHigh` → id `gpt-test`) on a single endpoint. */
function singleEndpointGateway(endpoint: Endpoint) {
  const chain = [FixtureModels.oHigh];
  const routing: RoutingTable = { [Reasoning.Low]: chain, [Reasoning.Medium]: chain, [Reasoning.High]: chain };
  return createGateway({
    hosting: {
      name: 'single',
      displayName: 'single',
      endpoints: { only: endpoint },
      models: { oHigh: { endpoint: 'only', id: 'gpt-test' } },
    },
    routing,
    maxRetriesPerModel: 0,
  });
}

/** A fetch that records each JSON request body and answers HTTP 400 (non-retryable, so exactly one request). */
function recordingFetch() {
  const bodies: Record<string, unknown>[] = [];
  const fetch: typeof globalThis.fetch = (_input, init) => {
    if (typeof init?.body === 'string') bodies.push(JSON.parse(init.body) as Record<string, unknown>);
    return Promise.resolve(
      new Response(JSON.stringify({ error: { message: 'synthetic', type: 'invalid_request_error' } }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  return { bodies, fetch };
}

const azureEndpoint = createAzureOpenAIEndpoint({ resourceName: 'asc-ehr-test', apiKey: 'test' });

describe('provider statelessness (store: false)', () => {
  it.each([
    ['OpenAI', openaiEndpoint],
    ['Azure OpenAI', azureEndpoint],
  ])('%s endpoint declares store: false', (_name, endpoint) => {
    expect(endpoint.providerOptions?.openai).toEqual({ store: false });
  });

  it('Azure OpenAI also sets it under the `azure` key (read first by @ai-sdk/azure)', () => {
    expect(azureEndpoint.providerOptions?.azure).toEqual({ store: false });
  });

  it.each([
    ['OpenAI', openaiEndpoint],
    ['Azure OpenAI', azureEndpoint],
  ])('%s: the endpoint providerOptions reach every model call', async (_name, endpoint) => {
    const mock = new MockLanguageModelV4({ doGenerate: respondWith('{"a":"b"}') });
    const gateway = singleEndpointGateway({ ...endpoint, createModel: () => mock });

    await gateway.executeAgentTask(highCall);
    await gateway.executeAgentObject({ ...highCall, schema: z.object({ a: z.string() }) });

    expect(mock.doGenerateCalls).toHaveLength(2);
    for (const call of mock.doGenerateCalls) expect(call.providerOptions).toEqual(endpoint.providerOptions);
  });

  it('OpenAI: the Responses request body sent over the wire has store: false', async () => {
    const { bodies, fetch } = recordingFetch();
    const provider = createOpenAI({ apiKey: 'test', fetch });
    const gateway = singleEndpointGateway({
      ...openaiEndpoint,
      createModel: (id): LanguageModel => provider(id),
    });

    await expect(gateway.executeAgentTask(highCall)).rejects.toBeInstanceOf(AgentExecutionError);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.store).toBe(false);
  });

  it('Azure OpenAI: the Responses request body sent over the wire has store: false', async () => {
    const { bodies, fetch } = recordingFetch();
    const provider = createAzure({ resourceName: 'asc-ehr-test', apiKey: 'test', fetch });
    const gateway = singleEndpointGateway({
      ...azureEndpoint,
      createModel: (id): LanguageModel => provider(id),
    });

    await expect(gateway.executeAgentTask(highCall)).rejects.toBeInstanceOf(AgentExecutionError);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.store).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// Latency budget
// ─────────────────────────────────────────────────────────────

describe('latency budget', () => {
  it('a hung model times out and the call falls back to the next model', async () => {
    const fixture = createFixture({ 'a-high': hang() });
    const res = await createTestGateway(fixture, {
      latencyBudget: { attemptTimeoutMs: 20, totalTimeoutMs: 5_000 },
    }).executeAgentTask(highCall);

    expect(res).toMatchObject({ modelId: 'o-high', attempts: 2 });
    expect(callCount(fixture, 'a-high')).toBe(1);
  });

  it('once the deadline is spent, remaining models are not tried', async () => {
    const fixture = createFixture({ 'a-high': hang() });
    const err: unknown = await createTestGateway(fixture, {
      latencyBudget: { attemptTimeoutMs: 5_000, totalTimeoutMs: 20 },
    })
      .executeAgentTask(highCall)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AgentExecutionError);
    expect(err).toMatchObject({
      attempts: 1,
      lastModelId: 'a-high',
      failureKind: 'timeout',
      deadlineExceeded: true,
      retryable: true,
    });
    expect(callCount(fixture, 'o-high')).toBe(0);
    expect(callCount(fixture, 'a-high-2')).toBe(0);
  });

  it('the last model timing out throws a timeout (chain exhausted, not a deadline)', async () => {
    const fixture = createFixture({ 'a-high': hang() });
    const err: unknown = await createTestGateway(fixture, {
      latencyBudget: { attemptTimeoutMs: 20, totalTimeoutMs: 5_000 },
    })
      .executeAgentTask({ ...highCall, disableFallback: true })
      .catch((e: unknown) => e);

    expect(err).toMatchObject({ attempts: 1, failureKind: 'timeout', deadlineExceeded: false, retryable: true });
  });

  it('a task profile budget overrides the gateway budget', async () => {
    const fixture = createFixture({ 'a-high': hang() });
    const taskProfiles = {
      ...TASK_PROFILES,
      [Task.General]: { ...TASK_PROFILES[Task.General], latencyBudget: { attemptTimeoutMs: 20 } },
    };
    const res = await createTestGateway(fixture, {
      taskProfiles,
      latencyBudget: { attemptTimeoutMs: 60_000, totalTimeoutMs: 5_000 },
    }).executeAgentTask(highCall);

    expect(res).toMatchObject({ modelId: 'o-high', attempts: 2 });
  });

  it('a caller abort is NOT retried on another model', async () => {
    const fixture = createFixture({ 'a-high': hang() });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    const err: unknown = await createTestGateway(fixture)
      .executeAgentTask({ ...highCall, abortSignal: controller.signal })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AgentExecutionError);
    expect(err).toMatchObject({ attempts: 1, retryable: false, failureKind: 'aborted', deadlineExceeded: false });
    expect(callCount(fixture, 'o-high')).toBe(0);
  });

  it('a caller abort during a transient failure is still not retried', async () => {
    const controller = new AbortController();
    const fixture = createFixture({
      'a-high': () => {
        controller.abort();
        return Promise.reject(apiError(503));
      },
    });
    await expect(
      createTestGateway(fixture).executeAgentTask({ ...highCall, abortSignal: controller.signal }),
    ).rejects.toMatchObject({ retryable: false, failureKind: 'aborted' });
    expect(callCount(fixture, 'o-high')).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Refusal fails closed
// ─────────────────────────────────────────────────────────────

describe('refusal fails closed', () => {
  it('a text refusal throws and never reaches a second model', async () => {
    const fixture = createFixture({ 'a-high': refuse() });
    const err: unknown = await createTestGateway(fixture)
      .executeAgentTask(highCall)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AgentExecutionError);
    expect(err).toMatchObject({ attempts: 1, retryable: false, failureKind: 'refusal' });
    expect((err as AgentExecutionError).cause).toBeInstanceOf(ModelRefusalError);
    expect(callCount(fixture, 'o-high')).toBe(0);
    expect(callCount(fixture, 'a-high-2')).toBe(0);
  });

  it('a structured-output refusal never reaches a second model', async () => {
    const fixture = createFixture({ 'a-high': refuse() });
    await expect(
      createTestGateway(fixture).executeAgentObject({ ...highCall, schema: z.object({ a: z.string() }) }),
    ).rejects.toMatchObject({ attempts: 1, retryable: false, failureKind: 'refusal' });
    expect(callCount(fixture, 'o-high')).toBe(0);
  });

  it('an Azure content-filter rejection (HTTP 400 content_filter) is a refusal, not a fallback', async () => {
    const filtered = apiError(400);
    Object.defineProperty(filtered, 'data', { value: { error: { code: 'content_filter' } } });
    const fixture = createFixture({ 'a-high': failWith(filtered) });
    await expect(createTestGateway(fixture).executeAgentTask(highCall)).rejects.toMatchObject({
      failureKind: 'refusal',
      retryable: false,
    });
    expect(callCount(fixture, 'o-high')).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Token usage
// ─────────────────────────────────────────────────────────────

describe('token usage', () => {
  it('text and object calls report the serving model usage', async () => {
    const fixture = createFixture({ 'a-high': respondWith('{"a":"b"}') });
    const gateway = createTestGateway(fixture);
    const expected = { inputTokens: 1, outputTokens: 1, totalTokens: 2, cachedInputTokens: undefined };

    expect((await gateway.executeAgentTask(highCall)).usage).toEqual(expected);
    expect(
      (await gateway.executeAgentObject({ ...highCall, schema: z.object({ a: z.string() }) })).usage,
    ).toEqual(expected);
  });

  it('streams report no usage in the metadata', () => {
    const res = createTestGateway(createFixture()).streamAgentTask(highCall);
    expect(res.usage).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
// Telemetry
// ─────────────────────────────────────────────────────────────

describe('telemetry', () => {
  const starts: { recordInputs?: boolean; recordOutputs?: boolean; functionId?: string }[] = [];
  registerTelemetry({
    onStart: ({ recordInputs, recordOutputs, functionId }) => {
      starts.push({ recordInputs, recordOutputs, functionId });
    },
  });

  it('is off by default', async () => {
    starts.length = 0;
    await createTestGateway(createFixture()).executeAgentTask(highCall);
    expect(starts).toEqual([]);
  });

  it('when enabled, never records inputs or outputs and tags the task only', async () => {
    starts.length = 0;
    const gateway = createTestGateway(createFixture({ 'a-high': respondWith('{"a":"b"}') }), {
      telemetry: { isEnabled: true },
    });
    await gateway.executeAgentTask(highCall);
    await gateway.executeAgentObject({ ...highCall, schema: z.object({ a: z.string() }) });

    expect(starts).toEqual([
      { recordInputs: false, recordOutputs: false, functionId: Task.General },
      { recordInputs: false, recordOutputs: false, functionId: Task.General },
    ]);
  });
});
