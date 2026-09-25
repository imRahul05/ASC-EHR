import { MULTIMODAL_CAPABILITIES, TEXT_CAPABILITIES, defineModels } from './define.js';

/**
 * OpenAI models (logical). Served by the OpenAI API or Azure OpenAI — ids live in `hosting/`.
 * Capabilities: verify against OpenAI's model docs; vision is only claimed for
 * the GPT-6 flagship tiers until the smaller models are confirmed.
 */
export const openaiModels = defineModels({
  gpt6Astra: {
    vendor: 'openai',
    label: 'GPT-6 Astra',
    description: 'Flagship. Complex reasoning, end-to-end agentic workflows.',
    capabilities: MULTIMODAL_CAPABILITIES,
  },
  gpt6Sol: {
    vendor: 'openai',
    label: 'GPT-6 Sol',
    description: 'Balanced professional coding and agentic tasks.',
    capabilities: MULTIMODAL_CAPABILITIES,
  },
  gpt6Luna: {
    vendor: 'openai',
    label: 'GPT-6 Luna',
    description: 'Cost-effective, high-volume focused tasks.',
    capabilities: TEXT_CAPABILITIES,
  },
  gpt56Sol: {
    vendor: 'openai',
    label: 'GPT-5.6 Sol',
    description: 'Previous-gen professional standard. Good fallback.',
    capabilities: TEXT_CAPABILITIES,
  },
  gpt56Luna: {
    vendor: 'openai',
    label: 'GPT-5.6 Luna',
    description: 'Previous-gen cost-efficient model.',
    capabilities: TEXT_CAPABILITIES,
  },
});
