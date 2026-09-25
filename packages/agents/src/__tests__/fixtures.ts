/**
 * Test fixtures: fixture providers built with the same `defineProvider` as
 * production, backed by the SDK's MockLanguageModelV4, so gateway tests never
 * hit real providers.
 */

import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

import {
  Reasoning,
  defineProvider,
  type ModelSpec,
  type ProviderRegistry,
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

const spec = (id: string, deprecated?: boolean): ModelSpec => ({
  id,
  label: id,
  description: 'fixture',
  deprecated,
});

export interface Fixture {
  registry: ProviderRegistry;
  routing: RoutingTable;
  /** Mock model per fixture model id. */
  models: Record<string, MockLanguageModelV4>;
  /** Fixture model refs, for building custom routing tables. */
  refs: ReturnType<typeof defineFixtureProviders>['refs'];
}

function defineFixtureProviders(createModel: (modelId: string) => MockLanguageModelV4) {
  // Same BAA posture as production: anthropic yes, openai/google no.
  const anthropic = defineProvider({
    name: 'anthropic',
    displayName: 'anthropic',
    baa: true,
    createModel,
    models: { aHigh: spec('a-high'), aHigh2: spec('a-high-2'), aMed: spec('a-med') },
  });
  const openai = defineProvider({
    name: 'openai',
    displayName: 'openai',
    baa: false,
    createModel,
    models: {
      oHigh: spec('o-high'),
      oMed: spec('o-med'),
      oMedOld: spec('o-med-old', true),
      oLow: spec('o-low'),
    },
  });
  const google = defineProvider({
    name: 'google',
    displayName: 'google',
    baa: false,
    createModel,
    models: { gMed: spec('g-med'), gLow: spec('g-low') },
  });
  return {
    registry: { anthropic, openai, google } satisfies ProviderRegistry,
    refs: { ...anthropic.models, ...openai.models, ...google.models },
  };
}

/** Every fixture model answers "ok" unless overridden via `behaviour` (keyed by model id). */
export function createFixture(behaviour: Record<string, DoGenerate> = {}): Fixture {
  const models: Record<string, MockLanguageModelV4> = {};
  const { registry, refs } = defineFixtureProviders((modelId) => {
    const model = models[modelId];
    if (!model) throw new Error(`No fixture model ${modelId}`);
    return model;
  });

  for (const ref of Object.values(refs)) {
    models[ref.id] = new MockLanguageModelV4({
      provider: ref.provider,
      modelId: ref.id,
      doGenerate: behaviour[ref.id] ?? respondWith('ok'),
    });
  }

  const routing: RoutingTable = {
    [Reasoning.High]: [refs.aHigh, refs.oHigh, refs.aHigh2],
    [Reasoning.Medium]: [refs.oMedOld /* deprecated → must be skipped */, refs.oMed, refs.aMed, refs.gMed],
    [Reasoning.Low]: [refs.gLow, refs.oLow],
  };

  return { registry, routing, models, refs };
}

export function callCount(fixture: Fixture, modelId: string): number {
  return fixture.models[modelId]?.doGenerateCalls.length ?? 0;
}
