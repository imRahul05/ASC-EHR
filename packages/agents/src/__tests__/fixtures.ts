/**
 * Test fixtures: logical models + a mock hosting target built from the same
 * building blocks as production, backed by the SDK's MockLanguageModelV4, so
 * gateway tests never hit real providers.
 */

import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

import {
  Reasoning,
  defineModels,
  type HostingTarget,
  type ModelBinding,
  type RoutingTable,
} from '../config/index.js';

type MockOptions = NonNullable<ConstructorParameters<typeof MockLanguageModelV4>[0]>;
export type DoGenerate = NonNullable<MockOptions['doGenerate']>;

const USAGE = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

/** doGenerate implementation returning the given text. */
export function respondWith(text: string): DoGenerate {
  return () =>
    Promise.resolve({
      content: [{ type: 'text' as const, text }],
      finishReason: { unified: 'stop' as const, raw: undefined },
      usage: USAGE,
      warnings: [],
    });
}

/** doGenerate implementation that rejects with the given error. */
export function failWith(error: unknown): DoGenerate {
  return () => Promise.reject(error instanceof Error ? error : new Error(String(error)));
}

export function apiError(statusCode: number, isRetryable?: boolean): APICallError {
  return new APICallError({
    message: `HTTP ${statusCode}`,
    url: 'https://provider.test/v1',
    requestBodyValues: {},
    statusCode,
    isRetryable,
  });
}

/** Logical fixture models (hosting-independent). */
export const FixtureModels = defineModels({
  aHigh: { vendor: 'anthropic', label: 'A high', description: 'fixture' },
  aHigh2: { vendor: 'anthropic', label: 'A high 2', description: 'fixture' },
  aMed: { vendor: 'anthropic', label: 'A med', description: 'fixture' },
  oHigh: { vendor: 'openai', label: 'O high', description: 'fixture' },
  oMed: { vendor: 'openai', label: 'O med', description: 'fixture' },
  oMedOld: { vendor: 'openai', label: 'O med old', description: 'fixture', deprecated: true },
  oLow: { vendor: 'openai', label: 'O low', description: 'fixture' },
  gMed: { vendor: 'google', label: 'G med', description: 'fixture' },
  gLow: { vendor: 'google', label: 'G low', description: 'fixture' },
});

type FixtureModelName = keyof typeof FixtureModels;

export const FIXTURE_ROUTING: RoutingTable = {
  [Reasoning.High]: [FixtureModels.aHigh, FixtureModels.oHigh, FixtureModels.aHigh2],
  [Reasoning.Medium]: [
    FixtureModels.oMedOld, // deprecated → must be skipped
    FixtureModels.oMed,
    FixtureModels.aMed,
    FixtureModels.gMed,
  ],
  [Reasoning.Low]: [FixtureModels.gLow, FixtureModels.oLow],
};

export interface Fixture {
  hosting: HostingTarget;
  routing: RoutingTable;
  /** Mock model per model id sent to an endpoint. */
  models: Record<string, MockLanguageModelV4>;
}

function mockFactory(models: Record<string, MockLanguageModelV4>, behaviour: Record<string, DoGenerate>) {
  return (modelId: string): MockLanguageModelV4 => {
    models[modelId] ??= new MockLanguageModelV4({
      modelId,
      doGenerate: behaviour[modelId] ?? respondWith('ok'),
    });
    return models[modelId];
  };
}

/**
 * "direct"-like target with production's BAA posture: anthropic yes,
 * openai/google no. Model id === kebab-case of the logical name.
 * Every model answers "ok" unless overridden via `behaviour` (keyed by model id).
 */
export function createFixture(behaviour: Record<string, DoGenerate> = {}): Fixture {
  const models: Record<string, MockLanguageModelV4> = {};
  const createModel = mockFactory(models, behaviour);

  const bindings: Record<FixtureModelName, ModelBinding> = {
    aHigh: { endpoint: 'anthropic', id: 'a-high' },
    aHigh2: { endpoint: 'anthropic', id: 'a-high-2' },
    aMed: { endpoint: 'anthropic', id: 'a-med' },
    oHigh: { endpoint: 'openai', id: 'o-high' },
    oMed: { endpoint: 'openai', id: 'o-med' },
    oMedOld: { endpoint: 'openai', id: 'o-med-old' },
    oLow: { endpoint: 'openai', id: 'o-low' },
    gMed: { endpoint: 'google', id: 'g-med' },
    gLow: { endpoint: 'google', id: 'g-low' },
  };

  return {
    hosting: {
      name: 'fixture-direct',
      displayName: 'Fixture direct',
      endpoints: {
        anthropic: { displayName: 'anthropic', baa: true, createModel },
        openai: { displayName: 'openai', baa: false, createModel },
        google: { displayName: 'google', baa: false, createModel },
      },
      models: bindings,
    },
    routing: FIXTURE_ROUTING,
    models,
  };
}

/**
 * Cloud-like target (think Bedrock / Azure): only Anthropic models, served from
 * one BAA-covered endpoint with provider-specific ids. OpenAI/Google unhosted.
 */
export function createCloudFixture(behaviour: Record<string, DoGenerate> = {}): Fixture {
  const models: Record<string, MockLanguageModelV4> = {};
  const createModel = mockFactory(models, behaviour);
  return {
    hosting: {
      name: 'fixture-cloud',
      displayName: 'Fixture cloud',
      endpoints: { cloudClaude: { displayName: 'Cloud Claude', baa: true, createModel } },
      models: {
        aHigh: { endpoint: 'cloudClaude', id: 'cloud.a-high-v1' },
        aHigh2: { endpoint: 'cloudClaude', id: 'cloud.a-high-2-v1' },
        aMed: { endpoint: 'cloudClaude', id: 'cloud.a-med-v1' },
      },
    },
    routing: FIXTURE_ROUTING,
    models,
  };
}

export function callCount(fixture: Fixture, modelId: string): number {
  return fixture.models[modelId]?.doGenerateCalls.length ?? 0;
}
