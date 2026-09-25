import { defineModels } from './define.js';

/** OpenAI models (logical). Served by the OpenAI API or Azure OpenAI — ids live in `hosting/`. */
export const openaiModels = defineModels({
  gpt6Astra: {
    vendor: 'openai',
    label: 'GPT-6 Astra',
    description: 'Flagship. Complex reasoning, end-to-end agentic workflows.',
  },
  gpt6Sol: {
    vendor: 'openai',
    label: 'GPT-6 Sol',
    description: 'Balanced professional coding and agentic tasks.',
  },
  gpt6Luna: {
    vendor: 'openai',
    label: 'GPT-6 Luna',
    description: 'Cost-effective, high-volume focused tasks.',
  },
  gpt56Sol: {
    vendor: 'openai',
    label: 'GPT-5.6 Sol',
    description: 'Previous-gen professional standard. Good fallback.',
  },
  gpt56Luna: {
    vendor: 'openai',
    label: 'GPT-5.6 Luna',
    description: 'Previous-gen cost-efficient model.',
  },
});
