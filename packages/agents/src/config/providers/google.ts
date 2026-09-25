import { google as googleSdk } from '@ai-sdk/google';

import { defineProvider } from '../define.js';

export const google = defineProvider({
  name: 'google',
  displayName: 'Google',
  // No BAA with Google for this endpoint. Flip only after a signed BAA.
  baa: false,
  createModel: (modelId) => googleSdk(modelId),
  models: {
    gemini38Flash: {
      id: 'gemini-3.8-flash',
      label: 'Gemini 3.8 Flash',
      description: 'Current flagship workhorse. General tasks, grounding, computer use.',
    },
    gemini35FlashLite: {
      id: 'gemini-3.5-flash-lite',
      label: 'Gemini 3.5 Flash Lite',
      description: 'Cost-efficient, high-throughput lightweight model.',
    },
  },
});
