/**
 * Provider registry. Adding a provider = one new file + one line here.
 */

import type { ModelRef, ProviderRuntime } from '../define.js';
import { anthropic } from './anthropic.js';
import { google } from './google.js';
import { openai } from './openai.js';

export const PROVIDERS = { anthropic, openai, google } as const;

export type ProviderName = keyof typeof PROVIDERS;

/**
 * Every configured model, grouped by provider: `Models.anthropic.opus55`.
 * Routing tables reference these objects — never model id strings.
 */
export const Models = {
  anthropic: anthropic.models,
  openai: openai.models,
  google: google.models,
} as const satisfies Record<ProviderName, Record<string, ModelRef>>;

/** Runtime view of the providers. Injectable for tests. */
export type ProviderRegistry = Record<ProviderName, ProviderRuntime<ProviderName>>;

export const PROVIDER_REGISTRY: ProviderRegistry = PROVIDERS;

/** Flat list of every configured model (all providers). */
export const ALL_MODELS: readonly ModelRef<ProviderName>[] = Object.values<
  Readonly<Record<string, ModelRef<ProviderName>>>
>(Models).flatMap((models) => Object.values(models));
