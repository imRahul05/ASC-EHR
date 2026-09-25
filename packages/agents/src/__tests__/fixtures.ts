/**
 * Test fixtures: an injectable provider registry + routing table backed by the
 * SDK's MockLanguageModelV4, so gateway tests never hit real providers.
 */

import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

import type {
  ModelEntry,
  ProviderCatalog,
  ProviderName,
  ProviderRegistry,
  RoutingTable,
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

interface FixtureModel {
  provider: ProviderName;
  key: string;
  deprecated?: boolean;
}

const FIXTURE_MODELS: FixtureModel[] = [
  { provider: 'anthropic', key: 'a-high' },
  { provider: 'anthropic', key: 'a-high-2' },
  { provider: 'anthropic', key: 'a-med' },
  { provider: 'openai', key: 'o-high' },
  { provider: 'openai', key: 'o-med' },
  { provider: 'openai', key: 'o-med-old', deprecated: true },
  { provider: 'openai', key: 'o-low' },
  { provider: 'google', key: 'g-med' },
  { provider: 'google', key: 'g-low' },
];

/** Same shape as the production ROUTING_TABLE, with fixture model keys. */
export const TEST_ROUTING: RoutingTable = {
  high: [
    { provider: 'anthropic', modelKey: 'a-high' },
    { provider: 'openai', modelKey: 'o-high' },
    { provider: 'anthropic', modelKey: 'a-high-2' },
  ],
  medium: [
    { provider: 'openai', modelKey: 'o-med-old' }, // deprecated → must be skipped
    { provider: 'openai', modelKey: 'o-med' },
    { provider: 'anthropic', modelKey: 'a-med' },
    { provider: 'google', modelKey: 'g-med' },
  ],
  low: [
    { provider: 'google', modelKey: 'g-low' },
    { provider: 'openai', modelKey: 'o-low' },
  ],
};

export interface Fixture {
  registry: ProviderRegistry;
  routing: RoutingTable;
  /** Mock model per fixture model key (model id === key). */
  models: Record<string, MockLanguageModelV4>;
}

/**
 * Builds a registry with the same BAA posture as production:
 * anthropic baa=true, openai/google baa=false. Every model answers "ok"
 * unless overridden via `behaviour`.
 */
export function createFixture(behaviour: Record<string, DoGenerate> = {}): Fixture {
  const models: Record<string, MockLanguageModelV4> = {};
  for (const m of FIXTURE_MODELS) {
    models[m.key] = new MockLanguageModelV4({
      provider: m.provider,
      modelId: m.key,
      doGenerate: behaviour[m.key] ?? respondWith('ok'),
    });
  }

  const catalog = (provider: ProviderName, baa: boolean): ProviderCatalog => {
    const entries: Record<string, ModelEntry> = {};
    for (const m of FIXTURE_MODELS.filter((f) => f.provider === provider)) {
      entries[m.key] = {
        id: m.key,
        label: m.key,
        tier: 'medium',
        description: 'fixture',
        deprecated: m.deprecated,
      };
    }
    return {
      displayName: provider,
      providerKey: provider,
      baa,
      models: entries,
      getAdapter: (modelId) => {
        const model = models[modelId];
        if (!model) throw new Error(`No fixture model ${modelId}`);
        return model;
      },
    };
  };

  return {
    registry: {
      anthropic: catalog('anthropic', true),
      openai: catalog('openai', false),
      google: catalog('google', false),
    },
    routing: TEST_ROUTING,
    models,
  };
}

export function callCount(fixture: Fixture, key: string): number {
  return fixture.models[key]?.doGenerateCalls.length ?? 0;
}
