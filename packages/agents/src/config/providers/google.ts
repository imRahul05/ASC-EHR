import { google } from '@ai-sdk/google';

import type { Endpoint } from './define.js';

/** Google Gemini API (`@ai-sdk/google`). Key: GOOGLE_GENERATIVE_AI_API_KEY. */
export const googleEndpoint: Endpoint = {
  displayName: 'Google Gemini API',
  // No BAA for this endpoint.
  baa: false,
  createModel: (modelId) => google(modelId),
};
