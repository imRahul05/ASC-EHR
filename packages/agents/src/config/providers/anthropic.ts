import { anthropic } from '@ai-sdk/anthropic';

import type { Endpoint } from './define.js';

/** Anthropic API (`@ai-sdk/anthropic`). Key: ANTHROPIC_API_KEY. */
export const anthropicEndpoint: Endpoint = {
  displayName: 'Anthropic API',
  // Signed BAA in place with Anthropic (per GI ASC feature spec).
  baa: true,
  createModel: (modelId) => anthropic(modelId),
};
