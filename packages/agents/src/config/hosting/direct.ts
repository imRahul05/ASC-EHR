import { anthropicEndpoint, googleEndpoint, openaiEndpoint } from '../providers/index.js';
import { defineHostingTarget } from './define.js';

/** Vendor APIs called directly (today's default). */
export const directHosting = defineHostingTarget({
  name: 'direct',
  displayName: 'Vendor APIs (direct)',
  endpoints: {
    anthropic: anthropicEndpoint,
    openai: openaiEndpoint,
    google: googleEndpoint,
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
