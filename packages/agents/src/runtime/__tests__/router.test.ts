import { describe, expect, it } from 'vitest';

import { NoAvailableModelError, NoCapableModelError, NoCompliantModelError } from '../errors.js';
import {
  getFallbackChain,
  getModelForTask,
  getRoutingInfo,
  getRoutingOverview,
  resolveContainsPhi,
  resolveEffectiveTier,
} from '../router.js';
import { Capability, Models, Reasoning, Task, directHosting } from '../../config/index.js';
import { FixtureModels, createCloudFixture, createFixture } from '../../testing/fixtures.js';

describe('resolveEffectiveTier', () => {
  it('uses the task minimum when no override is given', () => {
    expect(resolveEffectiveTier(Task.MedicalCoding)).toBe(Reasoning.High);
    expect(resolveEffectiveTier(Task.Summarization)).toBe(Reasoning.Medium);
    expect(resolveEffectiveTier(Task.Classification)).toBe(Reasoning.Low);
  });

  it('returns the higher of task minimum and override (escalate, never downgrade)', () => {
    expect(resolveEffectiveTier(Task.MedicalCoding, Reasoning.Low)).toBe(Reasoning.High);
    expect(resolveEffectiveTier(Task.DataExtraction, Reasoning.High)).toBe(Reasoning.High);
    expect(resolveEffectiveTier(Task.Summarization, Reasoning.Low)).toBe(Reasoning.Medium);
  });
});

describe('resolveContainsPhi', () => {
  it('forces PHI routing for tasks whose profile handles PHI', () => {
    expect(resolveContainsPhi(Task.MedicalCoding, false)).toBe(true);
    expect(resolveContainsPhi(Task.Classification, false)).toBe(false);
    expect(resolveContainsPhi(Task.Classification, true)).toBe(true);
  });
});

describe('getFallbackChain', () => {
  it('skips deprecated models', () => {
    const { hosting, routing } = createFixture();
    const ids = getFallbackChain(Reasoning.Medium, { containsPhi: false, hosting, routing }).map(
      (m) => m.modelId,
    );
    expect(ids).toEqual(['o-med', 'a-med', 'g-med']);
  });

  it('filters to BAA endpoints when containsPhi is true', () => {
    const { hosting, routing } = createFixture();
    const chain = getFallbackChain(Reasoning.High, { containsPhi: true, hosting, routing });
    expect(chain.map((m) => m.endpoint)).toEqual(['anthropic', 'anthropic']);
    expect(chain.every((m) => m.baa)).toBe(true);
  });

  it('throws NoCompliantModelError when no BAA model exists for the tier', () => {
    const { hosting, routing } = createFixture();
    expect(() => getFallbackChain(Reasoning.Low, { containsPhi: true, hosting, routing })).toThrow(
      NoCompliantModelError,
    );
  });

  it('throws NoAvailableModelError when every model is deprecated', () => {
    const { hosting } = createFixture();
    const routing = { high: [], medium: [FixtureModels.oMedOld], low: [] };
    expect(() => getFallbackChain(Reasoning.Medium, { containsPhi: false, hosting, routing })).toThrow(
      NoAvailableModelError,
    );
  });

  it('uses the named routing profile when no explicit table is given', () => {
    const budget = getFallbackChain(Reasoning.High, { containsPhi: false, routingProfile: 'budget' });
    expect(budget[0]?.modelName).toBe('claudeSonnet5');
    const standard = getFallbackChain(Reasoning.High, { containsPhi: false });
    expect(standard[0]).toMatchObject({ modelName: 'claudeOpus55', modelId: 'claude-opus-5-5', hostingTarget: 'direct' });
  });
});

describe('capability requirements', () => {
  it('drops models lacking a required capability', () => {
    const { hosting, routing } = createFixture();
    const chain = getFallbackChain(Reasoning.High, {
      containsPhi: false,
      requires: [Capability.Vision],
      hosting,
      routing,
    });
    expect(chain.map((m) => m.modelName)).toEqual(['oHigh', 'aHigh2']);
  });

  it('applies the BAA filter after capabilities', () => {
    const { hosting, routing } = createFixture();
    const chain = getFallbackChain(Reasoning.High, {
      containsPhi: true,
      requires: [Capability.Vision],
      hosting,
      routing,
    });
    expect(chain.map((m) => m.modelName)).toEqual(['aHigh2']);
  });

  it('throws NoCapableModelError (tier, hosting, capabilities) when no hosted model qualifies', () => {
    const { hosting, routing } = createFixture();
    const call = () =>
      getFallbackChain(Reasoning.Low, { containsPhi: false, requires: [Capability.Vision], hosting, routing });
    expect(call).toThrow(NoCapableModelError);
    expect(call).toThrow(expect.objectContaining({
      tier: Reasoning.Low,
      hostingTarget: 'fixture-direct',
      requiredCapabilities: [Capability.Vision],
    }));
  });

  it('every production model declares tools and structured output', () => {
    for (const model of Object.values(Models)) {
      expect(model.capabilities).toEqual(expect.arrayContaining([Capability.Tools, Capability.StructuredOutput]));
    }
  });
});

describe('model pin', () => {
  it('replaces the tier chain, keeping pin order', () => {
    const { hosting, routing } = createFixture();
    const chain = getFallbackChain(Reasoning.Low, {
      containsPhi: false,
      models: [FixtureModels.aHigh2, FixtureModels.aHigh],
      hosting,
      routing,
    });
    expect(chain.map((m) => m.modelName)).toEqual(['aHigh2', 'aHigh']);
  });

  it('still applies deprecation, hosting and BAA filters to pinned models', () => {
    const cloud = createCloudFixture();
    const pinned = [FixtureModels.oMedOld, FixtureModels.oHigh, FixtureModels.aMed];
    const chain = getFallbackChain(Reasoning.High, { containsPhi: true, models: pinned, ...cloud });
    expect(chain.map((m) => m.modelName)).toEqual(['aMed']);

    const { hosting, routing } = createFixture();
    expect(() =>
      getFallbackChain(Reasoning.High, { containsPhi: true, models: [FixtureModels.oHigh], hosting, routing }),
    ).toThrow(NoCompliantModelError);
  });
});

describe('hosting targets', () => {
  it('the same routing resolves to different endpoints and ids per hosting target', () => {
    const direct = createFixture();
    const cloud = createCloudFixture();

    const onDirect = getFallbackChain(Reasoning.High, { containsPhi: false, ...direct });
    const onCloud = getFallbackChain(Reasoning.High, { containsPhi: false, ...cloud });

    expect(onDirect.map((m) => m.modelId)).toEqual(['a-high', 'o-high', 'a-high-2']);
    // Cloud target does not host OpenAI models → skipped; ids are cloud-specific.
    expect(onCloud.map((m) => [m.modelName, m.endpoint, m.modelId])).toEqual([
      ['aHigh', 'cloudClaude', 'cloud.a-high-v1'],
      ['aHigh2', 'cloudClaude', 'cloud.a-high-2-v1'],
    ]);
  });

  it('a tier with no hosted model throws NoAvailableModelError naming the target', () => {
    const cloud = createCloudFixture();
    expect(() => getFallbackChain(Reasoning.Low, { containsPhi: false, ...cloud })).toThrow(
      /hosting "fixture-cloud"/,
    );
  });
});

describe('getModelForTask', () => {
  it('applies task tier and task PHI policy', () => {
    const { hosting, routing } = createFixture();
    const primary = getModelForTask(Task.MedicalCoding, { containsPhi: false, hosting, routing });
    expect(primary).toMatchObject({ endpoint: 'anthropic', modelId: 'a-high', baa: true });
  });
});

describe('getRoutingInfo / getRoutingOverview', () => {
  it('exposes availability and BAA per entry on the active target', () => {
    const cloud = createCloudFixture();
    const info = getRoutingInfo(Reasoning.High, cloud);
    expect(info.map((i) => [i.modelName, i.available, i.baa])).toEqual([
      ['aHigh', true, true],
      ['oHigh', false, false],
      ['aHigh2', true, true],
    ]);
  });

  it('lists every tier lowest → highest', () => {
    const { hosting, routing } = createFixture();
    expect(getRoutingOverview({ hosting, routing }).map((t) => t.tier)).toEqual([
      Reasoning.Low,
      Reasoning.Medium,
      Reasoning.High,
    ]);
  });
});

describe('production BAA posture (direct hosting)', () => {
  it('only the Anthropic endpoint is BAA-covered until further agreements are signed', () => {
    expect(directHosting.endpoints.anthropic.baa).toBe(true);
    expect(directHosting.endpoints.openai.baa).toBe(false);
    expect(directHosting.endpoints.google.baa).toBe(false);
  });
});
