import type { ProviderCatalog, ModelEntry } from '../../types.js';
import { ANTHROPIC_MODELS, type AnthropicModelId } from './constants.js';
import { anthropic } from '@ai-sdk/anthropic';

const models: Record<AnthropicModelId, ModelEntry<AnthropicModelId>> = {
  [ANTHROPIC_MODELS.CLAUDE_OPUS_5_5]: {
    id: ANTHROPIC_MODELS.CLAUDE_OPUS_5_5,
    label: 'Claude Opus 5.5',
    tier: 'high',
    description: 'Latest flagship. Deep reasoning, long-context agentic coding.',
  },
  [ANTHROPIC_MODELS.CLAUDE_FABLE_5_1]: {
    id: ANTHROPIC_MODELS.CLAUDE_FABLE_5_1,
    label: 'Claude Fable 5.1',
    tier: 'high',
    description: 'Reasoning-specialist for demanding agentic tasks & research.',
  },
  [ANTHROPIC_MODELS.CLAUDE_SONNET_5]: {
    id: ANTHROPIC_MODELS.CLAUDE_SONNET_5,
    label: 'Claude Sonnet 5',
    tier: 'medium',
    description: 'Balanced production model. Good mix of quality & cost.',
  },
  [ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5]: {
    id: ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5,
    label: 'Claude Haiku 4.5',
    tier: 'low',
    description: 'Fast, low-cost. Best for classification and extraction.',
  },
};

export const ANTHROPIC_CATALOG: ProviderCatalog = {
  displayName: 'Anthropic',
  providerKey: 'anthropic',
  // Signed BAA in place with Anthropic (per GI ASC feature spec).
  baa: true,
  models,
  getAdapter: (modelId) => anthropic(modelId),
};
