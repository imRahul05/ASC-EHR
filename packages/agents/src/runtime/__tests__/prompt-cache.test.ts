import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import type { AgentCallParams, GatewayOptions } from '../gateway.js';
import { createGateway } from '../gateway.js';
import { AgentExecutionError } from '../errors.js';
import {
  Reasoning,
  Task,
  anthropicEndpoint,
  googleEndpoint,
  openaiEndpoint,
  type Endpoint,
  type RoutingTable,
} from '../../config/index.js';
import { runAgent } from '../../agents/run.js';
import { defineAgent, promptCacheKey } from '../../agents/define.js';
import {
  FixtureModels,
  createAuditRecorder,
  createTestGateway,
  createFixture,
  defineTestAgent,
  respondWith,
  type DoGenerate,
} from '../../testing/fixtures.js';

const KEY = 'test-agent@2026-01-01.1';
const INSTRUCTIONS = 'synthetic stable instructions';
const call: AgentCallParams = {
  task: Task.General,
  reasoning: Reasoning.High,
  containsPhi: false,
  instructions: INSTRUCTIONS,
  messages: [{ role: 'user', content: 'synthetic, non-PHI per-case facts' }],
};

/** Every tier routes to one model (`aHigh` → id `model-test`) on a single endpoint. */
function singleEndpointGateway(endpoint: Endpoint, options: GatewayOptions = {}) {
  const chain = [FixtureModels.aHigh];
  const routing: RoutingTable = { [Reasoning.Low]: chain, [Reasoning.Medium]: chain, [Reasoning.High]: chain };
  return createGateway({
    hosting: {
      name: 'single',
      displayName: 'single',
      endpoints: { only: endpoint },
      models: { aHigh: { endpoint: 'only', id: 'model-test' } },
    },
    routing,
    maxRetriesPerModel: 0,
    ...options,
  });
}

function mockEndpoint(endpoint: Endpoint, doGenerate: DoGenerate = respondWith('ok')) {
  const mock = new MockLanguageModelV4({ doGenerate });
  return { mock, endpoint: { ...endpoint, createModel: () => mock } };
}

/** A fetch that records each JSON request body and answers HTTP 400 (non-retryable, so exactly one request). */
function recordingFetch() {
  const bodies: Record<string, unknown>[] = [];
  const fetch: typeof globalThis.fetch = (_input, init) => {
    if (typeof init?.body === 'string') bodies.push(JSON.parse(init.body) as Record<string, unknown>);
    return Promise.resolve(
      new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'synthetic' } }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  return { bodies, fetch };
}

describe('prompt caching: Anthropic (explicit breakpoint after the instructions)', () => {
  it('with a cache key, the instructions are a system message carrying cacheControl', async () => {
    const { mock, endpoint } = mockEndpoint(anthropicEndpoint);
    await singleEndpointGateway(endpoint).executeAgentTask({ ...call, promptCacheKey: KEY });

    const [system, user] = mock.doGenerateCalls[0]?.prompt ?? [];
    expect(system).toMatchObject({
      role: 'system',
      content: INSTRUCTIONS,
      providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
    });
    // The per-case messages are after the breakpoint and carry no cache marker.
    expect(user?.providerOptions).toBeUndefined();
  });

  it('without a cache key, nothing is marked', async () => {
    const { mock, endpoint } = mockEndpoint(anthropicEndpoint);
    await singleEndpointGateway(endpoint).executeAgentTask(call);

    const [system] = mock.doGenerateCalls[0]?.prompt ?? [];
    expect(system).toMatchObject({ role: 'system', content: INSTRUCTIONS });
    expect(system?.providerOptions).toBeUndefined();
  });

  it('the request body sent over the wire has cache_control on the system block only', async () => {
    const { bodies, fetch } = recordingFetch();
    const provider = createAnthropic({ apiKey: 'test', fetch });
    const gateway = singleEndpointGateway({ ...anthropicEndpoint, createModel: (id): LanguageModel => provider(id) });

    await expect(gateway.executeAgentTask({ ...call, promptCacheKey: KEY })).rejects.toBeInstanceOf(
      AgentExecutionError,
    );
    expect(bodies).toHaveLength(1);
    const body = bodies[0];
    expect(body?.system).toEqual([{ type: 'text', text: INSTRUCTIONS, cache_control: { type: 'ephemeral' } }]);
    // No top-level automatic caching: it would place the breakpoint after the per-case tail.
    expect(body).not.toHaveProperty('cache_control');
    expect(JSON.stringify(body?.messages)).not.toContain('cache_control');
  });
});

describe('prompt caching: OpenAI (cache key, in-memory retention)', () => {
  it('the request body has prompt_cache_key, in_memory retention and still store: false', async () => {
    const { bodies, fetch } = recordingFetch();
    const provider = createOpenAI({ apiKey: 'test', fetch });
    const gateway = singleEndpointGateway({ ...openaiEndpoint, createModel: (id): LanguageModel => provider(id) });

    await expect(gateway.executeAgentTask({ ...call, promptCacheKey: KEY })).rejects.toBeInstanceOf(
      AgentExecutionError,
    );
    expect(bodies[0]).toMatchObject({ prompt_cache_key: KEY, prompt_cache_retention: 'in_memory', store: false });
  });

  it('without a cache key, only the mandatory options are sent', async () => {
    const { mock, endpoint } = mockEndpoint(openaiEndpoint);
    await singleEndpointGateway(endpoint).executeAgentTask(call);
    expect(mock.doGenerateCalls[0]?.providerOptions).toEqual(openaiEndpoint.providerOptions);
  });
});

describe('prompt caching: policy', () => {
  it("the endpoint's mandatory options win over its cache options", async () => {
    const { mock, endpoint } = mockEndpoint({
      ...openaiEndpoint,
      promptCache: { call: (key) => ({ openai: { promptCacheKey: key, store: true } }) },
    });
    await singleEndpointGateway(endpoint).executeAgentTask({ ...call, promptCacheKey: KEY });
    expect(mock.doGenerateCalls[0]?.providerOptions).toEqual({ openai: { promptCacheKey: KEY, store: false } });
  });

  it('promptCaching: false sends no cache options at all', async () => {
    const anthropic = mockEndpoint(anthropicEndpoint);
    await singleEndpointGateway(anthropic.endpoint, { promptCaching: false }).executeAgentTask({
      ...call,
      promptCacheKey: KEY,
    });
    expect(anthropic.mock.doGenerateCalls[0]?.prompt[0]?.providerOptions).toBeUndefined();

    const openai = mockEndpoint(openaiEndpoint);
    await singleEndpointGateway(openai.endpoint, { promptCaching: false }).executeAgentTask({
      ...call,
      promptCacheKey: KEY,
    });
    expect(openai.mock.doGenerateCalls[0]?.providerOptions).toEqual(openaiEndpoint.providerOptions);
  });

  it('endpoints without promptCache (Gemini: implicit caching) get nothing extra', async () => {
    const { mock, endpoint } = mockEndpoint(googleEndpoint);
    await singleEndpointGateway(endpoint).executeAgentTask({ ...call, promptCacheKey: KEY });
    expect(mock.doGenerateCalls[0]?.providerOptions).toBeUndefined();
    expect(mock.doGenerateCalls[0]?.prompt[0]?.providerOptions).toBeUndefined();
  });

  it.each(['has spaces in it', 'Jane Doe', 'x'.repeat(65), ''])(
    'rejects a free-text or overlong cache key (%j) before calling any model',
    async (promptCacheKey) => {
      const { mock, endpoint } = mockEndpoint(openaiEndpoint);
      await expect(
        singleEndpointGateway(endpoint).executeAgentTask({ ...call, promptCacheKey }),
      ).rejects.toBeInstanceOf(TypeError);
      expect(mock.doGenerateCalls).toHaveLength(0);
    },
  );

  it('reports cache reads and writes in the usage metadata', async () => {
    const { endpoint } = mockEndpoint(anthropicEndpoint, () =>
      Promise.resolve({
        content: [{ type: 'text' as const, text: 'ok' }],
        finishReason: { unified: 'stop' as const, raw: undefined },
        usage: {
          inputTokens: { total: 1200, noCache: 100, cacheRead: 800, cacheWrite: 300 },
          outputTokens: { total: 5, text: 5, reasoning: undefined },
        },
        warnings: [],
      }),
    );
    const res = await singleEndpointGateway(endpoint).executeAgentTask({ ...call, promptCacheKey: KEY });
    expect(res.usage).toMatchObject({ inputTokens: 1200, cachedInputTokens: 800, cacheWriteTokens: 300 });
  });
});

describe('prompt caching: agents', () => {
  it('promptCacheKey is name@promptVersion', () => {
    expect(promptCacheKey(defineTestAgent())).toBe(KEY);
  });

  it('defineAgent rejects a name too long for a cache key', () => {
    expect(() => defineTestAgent({ name: `a${'-b'.repeat(40)}` })).toThrow(/prompt-cache key/);
    expect(() => defineAgent({ ...defineTestAgent(), name: 'short-name' })).not.toThrow();
  });

  it("runAgent passes the agent's cache key to the gateway", async () => {
    const fixture = createFixture({ 'o-med': respondWith('{"answer":"42"}') });
    const gateway = createTestGateway(fixture);
    const keys: (string | undefined)[] = [];
    await runAgent(
      defineTestAgent(),
      { topic: 'synthetic' },
      {
        actor: { type: 'user', id: 'user-1' },
        containsPhi: false,
        audit: createAuditRecorder(),
        gateway: {
          ...gateway,
          executeAgentObject(params) {
            keys.push(params.promptCacheKey);
            return gateway.executeAgentObject(params);
          },
        },
      },
    );
    expect(keys).toEqual([KEY]);
  });

  it('runAgent audits cache read and write token counts', async () => {
    const fixture = createFixture({
      'o-med': () =>
        Promise.resolve({
          content: [{ type: 'text' as const, text: '{"answer":"42"}' }],
          finishReason: { unified: 'stop' as const, raw: undefined },
          usage: {
            inputTokens: { total: 1200, noCache: 100, cacheRead: 800, cacheWrite: 300 },
            outputTokens: { total: 5, text: 5, reasoning: undefined },
          },
          warnings: [],
        }),
    });
    const audit = createAuditRecorder();
    await runAgent(
      defineTestAgent(),
      { topic: 'synthetic' },
      { actor: { type: 'user', id: 'user-1' }, containsPhi: false, audit, gateway: createTestGateway(fixture) },
    );
    expect(audit.events[0]?.details).toMatchObject({ cachedInputTokens: 800, cacheWriteTokens: 300 });
  });
});
