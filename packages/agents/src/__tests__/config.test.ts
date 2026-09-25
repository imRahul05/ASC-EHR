import { describe, expect, it } from 'vitest';

import {
  ALL_MODELS,
  Models,
  REASONING_TIERS,
  Reasoning,
  ROUTING_PROFILES,
  TASK_PROFILES,
  Task,
  isReasoningTier,
  maxReasoning,
  validateAgentConfig,
} from '../config/index.js';
import { createFixture } from './fixtures.js';

describe('Reasoning helpers', () => {
  it('orders tiers lowest → highest', () => {
    expect(REASONING_TIERS).toEqual(['low', 'medium', 'high']);
  });

  it('maxReasoning picks the higher tier and ignores a missing override', () => {
    expect(maxReasoning(Reasoning.Low, Reasoning.High)).toBe(Reasoning.High);
    expect(maxReasoning(Reasoning.High, Reasoning.Low)).toBe(Reasoning.High);
    expect(maxReasoning(Reasoning.Medium)).toBe(Reasoning.Medium);
  });

  it('isReasoningTier validates untrusted input', () => {
    expect(isReasoningTier('high')).toBe(true);
    expect(isReasoningTier('extreme')).toBe(false);
    expect(isReasoningTier(undefined)).toBe(false);
  });
});

describe('model definitions', () => {
  it('stamps provider and key onto each model', () => {
    expect(Models.anthropic.opus55).toMatchObject({
      provider: 'anthropic',
      key: 'opus55',
      id: 'claude-opus-5-5',
    });
  });

  it('has unique model ids per provider', () => {
    const ids = ALL_MODELS.map((m) => `${m.provider}/${m.id}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every task has a profile', () => {
    for (const task of Object.values(Task)) {
      expect(TASK_PROFILES[task]).toBeDefined();
    }
  });
});

describe('validateAgentConfig', () => {
  it('production config (all routing profiles) is valid', () => {
    expect(validateAgentConfig()).toEqual([]);
  });

  it('every routing profile covers every tier', () => {
    for (const table of Object.values(ROUTING_PROFILES)) {
      expect(Object.keys(table).sort()).toEqual([...REASONING_TIERS].sort());
    }
  });

  it('reports empty tiers, deprecated models, duplicates and PHI tasks without a BAA model', () => {
    const { registry, refs } = createFixture();
    const problems = validateAgentConfig({
      registry,
      routingProfiles: {
        broken: {
          [Reasoning.High]: [refs.oHigh, refs.oHigh],
          [Reasoning.Medium]: [refs.oMedOld, refs.aMed],
          [Reasoning.Low]: [],
        },
      },
    });

    expect(problems).toEqual(
      expect.arrayContaining([
        'routing "broken" tier "low" is empty',
        'routing "broken" tier "medium" routes deprecated model openai/oMedOld',
        'routing "broken" tier "high" lists openai/o-high twice',
        expect.stringContaining('routing "broken" tier "high" has no BAA-covered model but serves PHI tasks'),
      ]),
    );
  });
});
