import { type LanguageModel } from 'ai';

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
  models: Record<string, ModelEntry>;
  getAdapter: (modelId: string) => LanguageModel;
}

export interface FallbackEntry {
  provider: ProviderName;
  modelKey: string;
}

export type TaskType =
  | 'medical-coding'
  | 'diagnostic-reasoning'
  | 'summarization'
  | 'data-extraction'
  | 'validation'
  | 'classification'
  | 'general';
