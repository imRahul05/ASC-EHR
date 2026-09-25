import type { ProviderCatalog, ModelEntry } from '../../types.js';
import { GOOGLE_MODELS, type GoogleModelId } from './constants.js';
import { google } from '@ai-sdk/google';

const models: Record<GoogleModelId, ModelEntry<GoogleModelId>> = {
  [GOOGLE_MODELS.GEMINI_3_8_FLASH]: {
    id: GOOGLE_MODELS.GEMINI_3_8_FLASH,
    label: 'Gemini 3.8 Flash',
    tier: 'medium',
    description: 'Current flagship workhorse. General tasks, grounding, computer use.',
  },
  [GOOGLE_MODELS.GEMINI_3_5_FLASH_LITE]: {
    id: GOOGLE_MODELS.GEMINI_3_5_FLASH_LITE,
    label: 'Gemini 3.5 Flash Lite',
    tier: 'low',
    description: 'Cost-efficient, high-throughput lightweight model.',
  },
};

export const GOOGLE_CATALOG: ProviderCatalog = {
  displayName: 'Google',
  providerKey: 'google',
  // No BAA with Google for this endpoint. Flip only after a signed BAA.
  baa: false,
  models,
  getAdapter: (modelId) => google(modelId),
};
