import { describe, expect, it } from 'vitest';

import { NoAvailableModelError, NoCompliantModelError } from '../errors.js';
import {
  getFallbackChain,
  getModelForTask,
  getRoutingInfo,
  getRoutingOverview,
  resolveContainsPhi,
  resolveEffectiveTier,
} from '../router.js';
import { PROVIDER_REGISTRY, Reasoning, Task } from '../config/index.js';
import { createFixture } from './fixtures.js';

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
    const { registry, routing } = createFixture();
    const ids = getFallbackChain(Reasoning.Medium, { containsPhi: false, registry, routing }).map(
      (m) => m.modelId,
    );
    expect(ids).toEqual(['o-med', 'a-med', 'g-med']);
  });

  it('filters to BAA providers when containsPhi is true', () => {
    const { registry, routing } = createFixture();
    const chain = getFallbackChain(Reasoning.High, { containsPhi: true, registry, routing });
    expect(chain.map((m) => m.provider)).toEqual(['anthropic', 'anthropic']);
    expect(chain.every((m) => m.baa)).toBe(true);
  });

  it('throws NoCompliantModelError when no BAA model exists for the tier', () => {
    const { registry, routing } = createFixture();
    expect(() => getFallbackChain(Reasoning.Low, { containsPhi: true, registry, routing })).toThrow(
      NoCompliantModelError,
    );
  });

  it('throws NoAvailableModelError when every model is deprecated', () => {
    const { registry, refs } = createFixture();
    const routing = { high: [], medium: [refs.oMedOld], low: [] };
    expect(() => getFallbackChain(Reasoning.Medium, { containsPhi: false, registry, routing })).toThrow(
      NoAvailableModelError,
    );
  });

  it('uses the named routing profile when no explicit table is given', () => {
    const budget = getFallbackChain(Reasoning.High, { containsPhi: false, routingProfile: 'budget' });
    expect(budget[0]?.modelKey).toBe('sonnet5');
    const standard = getFallbackChain(Reasoning.High, { containsPhi: false });
    expect(standard[0]?.modelKey).toBe('opus55');
  });
});

describe('getModelForTask', () => {
  it('applies task tier and task PHI policy', () => {
    const { registry, routing } = createFixture();
    const primary = getModelForTask(Task.MedicalCoding, { containsPhi: false, registry, routing });
    expect(primary).toMatchObject({ provider: 'anthropic', modelId: 'a-high', baa: true });
  });
});

describe('getRoutingInfo / getRoutingOverview', () => {
  it('exposes the BAA flag per entry', () => {
    const { registry, routing } = createFixture();
    const info = getRoutingInfo(Reasoning.High, { registry, routing });
    expect(info.map((i) => [i.provider, i.baa])).toEqual([
      ['anthropic', true],
      ['openai', false],
      ['anthropic', true],
    ]);
  });

  it('lists every tier lowest → highest', () => {
    const { registry, routing } = createFixture();
    expect(getRoutingOverview({ registry, routing }).map((t) => t.tier)).toEqual([
      Reasoning.Low,
      Reasoning.Medium,
      Reasoning.High,
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
