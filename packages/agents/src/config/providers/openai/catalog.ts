import type { ProviderCatalog, ModelEntry } from '../../types.js';
import { OPENAI_MODELS, type OpenAIModelId } from './constants.js';
import { openai } from '@ai-sdk/openai';

const models: Record<OpenAIModelId, ModelEntry<OpenAIModelId>> = {
  [OPENAI_MODELS.GPT_6_ASTRA]: {
    id: OPENAI_MODELS.GPT_6_ASTRA,
    label: 'GPT-6 Astra',
    tier: 'high',
    description: 'Flagship. Complex reasoning, end-to-end agentic workflows.',
  },
  [OPENAI_MODELS.GPT_6_SOL]: {
    id: OPENAI_MODELS.GPT_6_SOL,
    label: 'GPT-6 Sol',
    tier: 'medium',
    description: 'Balanced professional coding & agentic tasks.',
  },
  [OPENAI_MODELS.GPT_6_LUNA]: {
    id: OPENAI_MODELS.GPT_6_LUNA,
    label: 'GPT-6 Luna',
    tier: 'low',
    description: 'Cost-effective, high-volume focused tasks.',
  },
  [OPENAI_MODELS.GPT_5_6_SOL]: {
    id: OPENAI_MODELS.GPT_5_6_SOL,
    label: 'GPT-5.6 Sol',
    tier: 'medium',
    description: 'Previous-gen professional standard. Good fallback.',
  },
  [OPENAI_MODELS.GPT_5_6_LUNA]: {
    id: OPENAI_MODELS.GPT_5_6_LUNA,
    label: 'GPT-5.6 Luna',
    tier: 'low',
    description: 'Previous-gen cost-efficient model.',
  },
};

export const OPENAI_CATALOG: ProviderCatalog = {
  displayName: 'OpenAI',
  providerKey: 'openai',
  // No BAA with OpenAI. Flip only after a signed BAA.
  // Azure OpenAI (under the Microsoft BAA) will be added later as its own provider.
  baa: false,
  models,
  getAdapter: (modelId) => openai(modelId),
};
