import type { LanguageModel } from 'ai';

export type ProviderName = 'openai' | 'anthropic' | 'google';
export type ReasoningTier = 'high' | 'medium' | 'low';

export interface ModelEntry<T = string> {
  id: T;
  label: string;
  tier: ReasoningTier;
  description: string;
  deprecated?: boolean;
}

export interface ProviderCatalog {
  displayName: string;
  providerKey: ProviderName;
  /**
   * Whether a signed HIPAA Business Associate Agreement (BAA) is in place with
   * this vendor for the account/endpoint `getAdapter` talks to.
   *
   * The gateway ONLY routes calls with `containsPhi: true` to providers where
   * this is `true`. Flip it only after the BAA is countersigned — this flag is
   * a compliance control, not a feature toggle.
   */
  baa: boolean;
  models: Record<string, ModelEntry>;
  getAdapter: (modelId: string) => LanguageModel;
}

export interface FallbackEntry {
  provider: ProviderName;
  modelKey: string;
}

/** Provider catalogs keyed by provider name. Injectable for tests. */
export type ProviderRegistry = Record<ProviderName, ProviderCatalog>;

/** Ordered fallback chain per reasoning tier. Injectable for tests. */
export type RoutingTable = Record<ReasoningTier, FallbackEntry[]>;

export type TaskType =
  | 'medical-coding'
  | 'diagnostic-reasoning'
  | 'summarization'
  | 'data-extraction'
  | 'validation'
  | 'classification'
  | 'general';
