import { describe, expect, it } from 'vitest';

import {
  ALL_MODELS,
  HOSTING_TARGETS_FOR_VALIDATION,
  createAzureHosting,
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
import { getFallbackChain } from '../router.js';
import { FixtureModels, createCloudFixture, createFixture } from './fixtures.js';

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

describe('model and hosting definitions', () => {
  it('stamps the logical name onto each model', () => {
    expect(Models.claudeOpus55).toMatchObject({ name: 'claudeOpus55', vendor: 'anthropic' });
  });

  it('logical models carry no API ids (those belong to hosting targets)', () => {
    for (const model of ALL_MODELS) expect(model).not.toHaveProperty('id');
  });

  it('direct hosting binds every non-deprecated model', () => {
    for (const model of ALL_MODELS.filter((m) => !m.deprecated)) {
      expect(HOSTING_TARGETS_FOR_VALIDATION.direct.models[model.name as keyof typeof Models]).toBeDefined();
    }
  });

  it('every task has a profile', () => {
    for (const task of Object.values(Task)) expect(TASK_PROFILES[task]).toBeDefined();
  });
});

describe('validateAgentConfig', () => {
  it('production config (all routing profiles × all hosting targets) is valid', () => {
    expect(validateAgentConfig()).toEqual([]);
  });

  it('every routing profile covers every tier', () => {
    for (const table of Object.values(ROUTING_PROFILES)) {
      expect(Object.keys(table).sort()).toEqual([...REASONING_TIERS].sort());
    }
  });

  it('reports deprecated, duplicate, unhosted tiers and PHI tiers without a BAA model', () => {
    const { hosting } = createFixture();
    const problems = validateAgentConfig({
      hostingTargets: { fixture: hosting },
      routingProfiles: {
        broken: {
          [Reasoning.High]: [FixtureModels.oHigh, FixtureModels.oHigh],
          [Reasoning.Medium]: [FixtureModels.oMedOld, FixtureModels.aMed],
          [Reasoning.Low]: [],
        },
      },
    });

    expect(problems).toEqual(
      expect.arrayContaining([
        'routing "broken" tier "low" has no model available on hosting "fixture-direct"',
        'routing "broken" tier "medium" routes deprecated model oMedOld',
        'routing "broken" tier "high" lists oHigh twice',
        expect.stringContaining(
          'routing "broken" tier "high" has no BAA-covered model on hosting "fixture-direct" but serves PHI tasks',
        ),
      ]),
    );
  });

  it('checks each hosting target separately', () => {
    const direct = createFixture();
    const cloud = createCloudFixture();
    const problems = validateAgentConfig({
      hostingTargets: { direct: direct.hosting, cloud: cloud.hosting },
      routingProfiles: { fixture: direct.routing },
    });
    // Cloud target hosts no low-tier model; direct hosts all of them.
    const availability = problems.filter((p) => p.includes('no model available'));
    expect(availability).toEqual(['routing "fixture" tier "low" has no model available on hosting "fixture-cloud"']);
  });

  it('reports bindings to an unknown endpoint', () => {
    const { hosting } = createFixture();
    const broken = { ...hosting, models: { ...hosting.models, aHigh: { endpoint: 'nope', id: 'x' } } };
    expect(validateAgentConfig({ hostingTargets: { broken } })).toEqual(
      expect.arrayContaining(['hosting "fixture-direct" binds aHigh to unknown endpoint "nope"']),
    );
  });
});

describe('Azure hosting', () => {
  const azure = createAzureHosting({
    azureOpenAI: { resourceName: 'asc-ehr-test', apiKey: 'test' },
    deployments: { gpt6Astra: 'prod-gpt6-astra', gpt6Luna: 'prod-gpt6-luna' },
  });

  it('binds deployed GPT models to their deployment names on the Azure OpenAI endpoint', () => {
    expect(azure.models.gpt6Astra).toEqual({ endpoint: 'azureOpenAI', id: 'prod-gpt6-astra' });
    expect(azure.models.gpt6Sol).toBeUndefined(); // not deployed → skipped by the router
    expect(azure.endpoints.azureOpenAI.baa).toBe(true);
  });

  it('keeps Claude on the Anthropic API by default, and drops it when Azure-only', () => {
    expect(azure.models.claudeOpus55).toEqual({ endpoint: 'anthropic', id: 'claude-opus-5-5' });
    const azureOnly = createAzureHosting({
      azureOpenAI: { resourceName: 'asc-ehr-test', apiKey: 'test' },
      deployments: { gpt6Astra: 'prod-gpt6-astra' },
      includeAnthropic: false,
    });
    expect(azureOnly.models.claudeOpus55).toBeUndefined();
  });

  it('routes the high tier through Azure deployment names', () => {
    const chain = getFallbackChain(Reasoning.High, { containsPhi: true, hosting: azure });
    expect(chain.map((m) => [m.endpoint, m.modelId])).toEqual([
      ['anthropic', 'claude-opus-5-5'],
      ['azureOpenAI', 'prod-gpt6-astra'],
      ['anthropic', 'claude-fable-5-1'],
    ]);
  });
});
