import { anthropic } from '@ai-sdk/anthropic';

import type { Endpoint } from './define.js';

/** Anthropic API (`@ai-sdk/anthropic`). Key: ANTHROPIC_API_KEY. */
export const anthropicEndpoint: Endpoint = {
  displayName: 'Anthropic API',
  // Signed BAA in place with Anthropic (per GI ASC feature spec).
  baa: true,
  createModel: (modelId) => anthropic(modelId),
  // Explicit breakpoint after the instructions: they are shared by every run of
  // an agent, the messages after them are unique per case. (Top-level automatic
  // caching would put the breakpoint after the unique tail and pay the write
  // premium on every call without a read.) 5-minute TTL: 1.25x write, ~0.1x read.
  // Prefixes below the model minimum (512–4096 tokens) are silently not cached.
  promptCache: {
    instructions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
  },
};
