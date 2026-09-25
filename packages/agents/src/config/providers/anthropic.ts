import { anthropic as anthropicSdk } from '@ai-sdk/anthropic';

import { defineProvider } from '../define.js';

export const anthropic = defineProvider({
  name: 'anthropic',
  displayName: 'Anthropic',
  // Signed BAA in place with Anthropic (per GI ASC feature spec).
  baa: true,
  createModel: (modelId) => anthropicSdk(modelId),
  models: {
    opus55: {
      id: 'claude-opus-5-5',
      label: 'Claude Opus 5.5',
      description: 'Latest flagship. Deep reasoning, long-context agentic coding.',
    },
    fable51: {
      id: 'claude-fable-5-1',
      label: 'Claude Fable 5.1',
      description: 'Reasoning specialist for demanding agentic tasks and research.',
    },
    sonnet5: {
      id: 'claude-sonnet-5',
      label: 'Claude Sonnet 5',
      description: 'Balanced production model. Good mix of quality and cost.',
    },
    haiku45: {
      id: 'claude-haiku-4-5-20251001',
      label: 'Claude Haiku 4.5',
      description: 'Fast, low-cost. Best for classification and extraction.',
    },
  },
});
