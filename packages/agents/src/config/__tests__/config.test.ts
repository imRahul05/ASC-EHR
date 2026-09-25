import { describe, expect, it } from 'vitest';

import {
  ALL_MODELS,
  HOSTING_TARGETS_FOR_VALIDATION,
  createAzureHosting,
  Models,
  REASONING_TIERS,
  Reasoning,
  TASK_PROFILES,
  Task,
  isReasoningTier,
  maxReasoning,
} from '../index.js';
import { getFallbackChain } from '../../runtime/router.js';

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
