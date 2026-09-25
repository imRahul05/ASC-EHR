import { MULTIMODAL_CAPABILITIES, TEXT_CAPABILITIES, defineModels } from './define.js';

/**
 * Google models (logical). Hosted ids live in `hosting/`.
 * Capabilities: verify against Google's model docs; Flash Lite is treated as
 * text-only until its vision support is confirmed for our use.
 */
export const googleModels = defineModels({
  gemini38Flash: {
    vendor: 'google',
    label: 'Gemini 3.8 Flash',
    description: 'Current flagship workhorse. General tasks, grounding, computer use.',
    capabilities: MULTIMODAL_CAPABILITIES,
  },
  gemini35FlashLite: {
    vendor: 'google',
    label: 'Gemini 3.5 Flash Lite',
    description: 'Cost-efficient, high-throughput lightweight model.',
    capabilities: TEXT_CAPABILITIES,
  },
});
