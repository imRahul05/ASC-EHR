/**
 * Logical model catalog. Adding a vendor = one file in this folder + one spread here.
 * Everything else references models by typed name: `Models.claudeOpus55`.
 */

import { anthropicModels } from './anthropic.js';
import type { ModelRef } from './define.js';
import { googleModels } from './google.js';
import { openaiModels } from './openai.js';

export * from './define.js';
export { anthropicModels } from './anthropic.js';
export { googleModels } from './google.js';
export { openaiModels } from './openai.js';

export const Models = {
  ...anthropicModels,
  ...openaiModels,
  ...googleModels,
} as const;

export type ModelName = keyof typeof Models;

/** Every logical model. */
export const ALL_MODELS: readonly ModelRef[] = Object.values<ModelRef>(Models);
