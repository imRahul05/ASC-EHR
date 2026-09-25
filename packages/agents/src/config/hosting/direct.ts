import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';

import { defineHostingTarget } from './define.js';

/**
 * Vendor APIs called directly. API keys are read by each SDK from its standard
 * env var (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY).
 */
export const directHosting = defineHostingTarget({
  name: 'direct',
  displayName: 'Vendor APIs (direct)',
  endpoints: {
    anthropic: {
      displayName: 'Anthropic API',
      // Signed BAA in place with Anthropic (per GI ASC feature spec).
      baa: true,
      createModel: (id) => anthropic(id),
    },
    openai: {
      displayName: 'OpenAI API',
      // No BAA with OpenAI. Use Azure OpenAI (Microsoft BAA) for PHI instead.
      baa: false,
      createModel: (id) => openai(id),
    },
    google: {
      displayName: 'Google Gemini API',
      // No BAA for this endpoint.
      baa: false,
      createModel: (id) => google(id),
    },
  },
  models: {
    claudeOpus55: { endpoint: 'anthropic', id: 'claude-opus-5-5' },
    claudeFable51: { endpoint: 'anthropic', id: 'claude-fable-5-1' },
    claudeSonnet5: { endpoint: 'anthropic', id: 'claude-sonnet-5' },
    claudeHaiku45: { endpoint: 'anthropic', id: 'claude-haiku-4-5-20251001' },
    gpt6Astra: { endpoint: 'openai', id: 'gpt-6-astra' },
    gpt6Sol: { endpoint: 'openai', id: 'gpt-6-sol' },
    gpt6Luna: { endpoint: 'openai', id: 'gpt-6-luna' },
    gpt56Sol: { endpoint: 'openai', id: 'gpt-5.6-sol' },
    gpt56Luna: { endpoint: 'openai', id: 'gpt-5.6-luna' },
    gemini38Flash: { endpoint: 'google', id: 'gemini-3.8-flash' },
    gemini35FlashLite: { endpoint: 'google', id: 'gemini-3.5-flash-lite' },
  },
});
