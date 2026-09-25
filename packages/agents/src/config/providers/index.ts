import { type ProviderName, type ProviderCatalog } from '../types.js';
import { OPENAI_CATALOG } from './openai/catalog.js';
import { ANTHROPIC_CATALOG } from './anthropic/catalog.js';
import { GOOGLE_CATALOG } from './google/catalog.js';

export * from './openai/constants.js';
export * from './anthropic/constants.js';
export * from './google/constants.js';

export const PROVIDER_REGISTRY: Record<ProviderName, ProviderCatalog> = {
  openai: OPENAI_CATALOG,
  anthropic: ANTHROPIC_CATALOG,
  google: GOOGLE_CATALOG,
};
