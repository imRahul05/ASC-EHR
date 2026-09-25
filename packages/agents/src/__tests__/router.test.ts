import { describe, expect, it } from 'vitest';

import { NoAvailableModelError, NoCompliantModelError } from '../errors.js';
import { getFallbackChain, getRoutingInfo, resolveEffectiveTier } from '../router.js';
import { PROVIDER_REGISTRY } from '../config/index.js';
import { createFixture } from './fixtures.js';

describe('resolveEffectiveTier', () => {
  it('returns the higher of task-implied and requested tier', () => {
    expect(resolveEffectiveTier('medical-coding', 'low')).toBe('high');
    expect(resolveEffectiveTier('data-extraction', 'high')).toBe('high');
    expect(resolveEffectiveTier('summarization', 'low')).toBe('medium');
    expect(resolveEffectiveTier('classification', 'low')).toBe('low');
  });
});

describe('getFallbackChain', () => {
  it('skips deprecated models', () => {
    const { registry, routing } = createFixture();
    const ids = getFallbackChain('medium', { containsPhi: false, registry, routing }).map((m) => m.modelId);
    expect(ids).toEqual(['o-med', 'a-med', 'g-med']);
  });

  it('filters to BAA providers when containsPhi is true', () => {
    const { registry, routing } = createFixture();
    const chain = getFallbackChain('high', { containsPhi: true, registry, routing });
    expect(chain.map((m) => m.provider)).toEqual(['anthropic', 'anthropic']);
    expect(chain.every((m) => m.baa)).toBe(true);
  });

  it('throws NoCompliantModelError when no BAA model exists for the tier', () => {
    const { registry, routing } = createFixture();
    expect(() => getFallbackChain('low', { containsPhi: true, registry, routing })).toThrow(
      NoCompliantModelError,
    );
  });

  it('throws NoAvailableModelError when every model is deprecated', () => {
    const { registry } = createFixture();
    const routing = { high: [], medium: [{ provider: 'openai' as const, modelKey: 'o-med-old' }], low: [] };
    expect(() => getFallbackChain('medium', { containsPhi: false, registry, routing })).toThrow(
      NoAvailableModelError,
    );
  });
});

describe('getRoutingInfo', () => {
  it('exposes the BAA flag per entry', () => {
    const { registry, routing } = createFixture();
    const info = getRoutingInfo('high', { registry, routing });
    expect(info.map((i) => [i.provider, i.baa])).toEqual([
      ['anthropic', true],
      ['openai', false],
      ['anthropic', true],
    ]);
  });
});

describe('production BAA posture', () => {
  it('only Anthropic is BAA-covered until further agreements are signed', () => {
    expect(PROVIDER_REGISTRY.anthropic.baa).toBe(true);
    expect(PROVIDER_REGISTRY.openai.baa).toBe(false);
    expect(PROVIDER_REGISTRY.google.baa).toBe(false);
  });
});
