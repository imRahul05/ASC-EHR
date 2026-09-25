import { defineModels } from './define.js';

/** Google models (logical). Hosted ids live in `hosting/`. */
export const googleModels = defineModels({
  gemini38Flash: {
    vendor: 'google',
    label: 'Gemini 3.8 Flash',
    description: 'Current flagship workhorse. General tasks, grounding, computer use.',
  },
  gemini35FlashLite: {
    vendor: 'google',
    label: 'Gemini 3.5 Flash Lite',
    description: 'Cost-efficient, high-throughput lightweight model.',
  },
});
