import { openai } from '@ai-sdk/openai';

import type { Endpoint } from './define.js';

/** OpenAI API (`@ai-sdk/openai`). Key: OPENAI_API_KEY. */
export const openaiEndpoint: Endpoint = {
  displayName: 'OpenAI API',
  // No BAA with OpenAI. For PHI use Azure OpenAI (Microsoft BAA) — see azure-openai.ts.
  baa: false,
  createModel: (modelId) => openai(modelId),
  // `openai(id)` is the Responses API model, which defaults to `store: true`
  // (server-side retention of prompts + outputs). Always stateless.
  providerOptions: { openai: { store: false } },
};
