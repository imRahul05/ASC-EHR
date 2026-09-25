/**
 * Hosting targets. The app picks ONE at startup and passes it to
 * `createGateway({ hosting })`. Adding a target (e.g. AWS Bedrock) = one file
 * here + an entry in HOSTING_TARGETS_FOR_VALIDATION.
 */

import { createAzureHosting } from './azure.js';
import type { HostingTarget } from './define.js';
import { directHosting } from './direct.js';

export * from './define.js';
export { createAzureHosting, type AzureHostingSettings, type AzureOpenAIModelName } from './azure.js';
export { directHosting } from './direct.js';

export type HostingTargetName = 'direct' | 'azure';

/** Used when the app passes no `hosting`. */
export const DEFAULT_HOSTING_TARGET: HostingTarget = directHosting;

/**
 * Every target shape, instantiated with placeholder settings, so
 * `validateAgentConfig()` proves each routing profile still works — and still
 * has a BAA model for PHI tasks — on every cloud we may deploy to.
 * Placeholders are never called (validation does not create models).
 */
export const HOSTING_TARGETS_FOR_VALIDATION: Readonly<Record<HostingTargetName, HostingTarget>> = {
  direct: directHosting,
  azure: createAzureHosting({
    azureOpenAI: { resourceName: 'validation-placeholder', apiKey: 'validation-placeholder' },
    deployments: {
      gpt6Astra: 'gpt6Astra',
      gpt6Sol: 'gpt6Sol',
      gpt6Luna: 'gpt6Luna',
      gpt56Sol: 'gpt56Sol',
      gpt56Luna: 'gpt56Luna',
    },
    includeAnthropic: false,
  }),
};
