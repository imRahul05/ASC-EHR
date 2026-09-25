import { defineModels } from './define.js';

/** Anthropic models (logical). Hosted ids live in `hosting/`. */
export const anthropicModels = defineModels({
  claudeOpus55: {
    vendor: 'anthropic',
    label: 'Claude Opus 5.5',
    description: 'Latest flagship. Deep reasoning, long-context agentic coding.',
  },
  claudeFable51: {
    vendor: 'anthropic',
    label: 'Claude Fable 5.1',
    description: 'Reasoning specialist for demanding agentic tasks and research.',
  },
  claudeSonnet5: {
    vendor: 'anthropic',
    label: 'Claude Sonnet 5',
    description: 'Balanced production model. Good mix of quality and cost.',
  },
  claudeHaiku45: {
    vendor: 'anthropic',
    label: 'Claude Haiku 4.5',
    description: 'Fast, low-cost. Best for classification and extraction.',
  },
});
