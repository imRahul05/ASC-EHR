import { openai as openaiSdk } from '@ai-sdk/openai';

import { defineProvider } from '../define.js';

export const openai = defineProvider({
  name: 'openai',
  displayName: 'OpenAI',
  // No BAA with OpenAI. Flip only after a signed BAA.
  // Azure OpenAI (under the Microsoft BAA) will be added later as its own provider file.
  baa: false,
  createModel: (modelId) => openaiSdk(modelId),
  models: {
    gpt6Astra: {
      id: 'gpt-6-astra',
      label: 'GPT-6 Astra',
      description: 'Flagship. Complex reasoning, end-to-end agentic workflows.',
    },
    gpt6Sol: {
      id: 'gpt-6-sol',
      label: 'GPT-6 Sol',
      description: 'Balanced professional coding and agentic tasks.',
    },
    gpt6Luna: {
      id: 'gpt-6-luna',
      label: 'GPT-6 Luna',
      description: 'Cost-effective, high-volume focused tasks.',
    },
    gpt56Sol: {
      id: 'gpt-5.6-sol',
      label: 'GPT-5.6 Sol',
      description: 'Previous-gen professional standard. Good fallback.',
    },
    gpt56Luna: {
      id: 'gpt-5.6-luna',
      label: 'GPT-5.6 Luna',
      description: 'Previous-gen cost-efficient model.',
    },
  },
});
