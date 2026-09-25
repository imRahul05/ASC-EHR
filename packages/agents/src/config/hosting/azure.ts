import type { openaiModels } from '../models/index.js';
import {
  anthropicEndpoint,
  createAzureOpenAIEndpoint,
  type AzureOpenAIEndpointSettings,
} from '../providers/index.js';
import { defineHostingTarget, type ModelBinding } from './define.js';

/** OpenAI models that can be deployed on Azure OpenAI. */
export type AzureOpenAIModelName = keyof typeof openaiModels;

export interface AzureHostingSettings {
  azureOpenAI: AzureOpenAIEndpointSettings;
  /**
   * Logical model → Azure deployment name, for the models actually deployed in
   * the resource. Models left out are not available on this target (skipped).
   */
  deployments: Partial<Record<AzureOpenAIModelName, string>>;
  /**
   * Keep Claude on the Anthropic API alongside Azure OpenAI (default true).
   * Set false for an Azure-only deployment.
   */
  includeAnthropic?: boolean;
}

/**
 * Production on Azure: GPT models via Azure OpenAI (Microsoft BAA, deployment
 * names from settings) and, optionally, Claude via the Anthropic API (Anthropic BAA).
 * Built by the app at startup from its parsed env config.
 */
export function createAzureHosting(settings: AzureHostingSettings) {
  const includeAnthropic = settings.includeAnthropic ?? true;

  const gptBindings: Partial<Record<AzureOpenAIModelName, ModelBinding<'azureOpenAI'>>> = {};
  for (const [model, deployment] of Object.entries(settings.deployments) as [AzureOpenAIModelName, string][]) {
    gptBindings[model] = { endpoint: 'azureOpenAI', id: deployment };
  }

  return defineHostingTarget({
    name: 'azure',
    displayName: includeAnthropic ? 'Azure OpenAI + Anthropic API' : 'Azure OpenAI',
    endpoints: {
      azureOpenAI: createAzureOpenAIEndpoint(settings.azureOpenAI),
      anthropic: anthropicEndpoint,
    },
    models: {
      ...gptBindings,
      ...(includeAnthropic
        ? {
            claudeOpus55: { endpoint: 'anthropic', id: 'claude-opus-5-5' },
            claudeFable51: { endpoint: 'anthropic', id: 'claude-fable-5-1' },
            claudeSonnet5: { endpoint: 'anthropic', id: 'claude-sonnet-5' },
            claudeHaiku45: { endpoint: 'anthropic', id: 'claude-haiku-4-5-20251001' },
          }
        : {}),
    },
  });
}
