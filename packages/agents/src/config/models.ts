/**
 * Logical model catalog — WHAT models we use, independent of WHERE they are hosted.
 *
 * No API ids here: the same model has a different id / deployment name on the
 * vendor API, AWS Bedrock or Azure. Those live in `hosting/<target>.ts`.
 * Everything else references models by typed name: `Models.claudeOpus55`.
 */

/** Who builds the model (not who hosts it). */
export type ModelVendor = 'anthropic' | 'openai' | 'google';

export interface ModelSpec {
  vendor: ModelVendor;
  /** Display name for UIs and settings screens. */
  label: string;
  description: string;
  /** Deprecated models stay listed (history/UI) but must not be routed to. */
  deprecated?: boolean;
}

export interface ModelRef extends ModelSpec {
  /** Logical model name, e.g. `claudeOpus55`. */
  name: string;
}

export function defineModels<const M extends Record<string, ModelSpec>>(
  models: M,
): { readonly [K in keyof M]: M[K] & { name: K } } {
  return Object.fromEntries(
    Object.entries(models).map(([name, spec]) => [name, { ...spec, name }]),
  ) as { readonly [K in keyof M]: M[K] & { name: K } };
}

export const Models = defineModels({
  // Anthropic
  claudeOpus55: {
    vendor: 'anthropic',
    label: 'Claude Opus 5.5',
    description: 'Latest flagship. Deep reasoning, long-context agentic coding.',
  },
  claudeFable51: {
    vendor: 'anthropic',
    label: 'Claude Fable 5.1',
    description: 'Reasoning specialist for demanding agentic tasks and research.',
  },
  claudeSonnet5: {
    vendor: 'anthropic',
    label: 'Claude Sonnet 5',
    description: 'Balanced production model. Good mix of quality and cost.',
  },
  claudeHaiku45: {
    vendor: 'anthropic',
    label: 'Claude Haiku 4.5',
    description: 'Fast, low-cost. Best for classification and extraction.',
  },

  // OpenAI
  gpt6Astra: {
    vendor: 'openai',
    label: 'GPT-6 Astra',
    description: 'Flagship. Complex reasoning, end-to-end agentic workflows.',
  },
  gpt6Sol: {
    vendor: 'openai',
    label: 'GPT-6 Sol',
    description: 'Balanced professional coding and agentic tasks.',
  },
  gpt6Luna: {
    vendor: 'openai',
    label: 'GPT-6 Luna',
    description: 'Cost-effective, high-volume focused tasks.',
  },
  gpt56Sol: {
    vendor: 'openai',
    label: 'GPT-5.6 Sol',
    description: 'Previous-gen professional standard. Good fallback.',
  },
  gpt56Luna: {
    vendor: 'openai',
    label: 'GPT-5.6 Luna',
    description: 'Previous-gen cost-efficient model.',
  },

  // Google
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

export type ModelName = keyof typeof Models;

/** Every logical model. */
export const ALL_MODELS: readonly ModelRef[] = Object.values<ModelRef>(Models);
