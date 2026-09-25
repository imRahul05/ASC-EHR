/**
 * Logical model building blocks — WHAT a model is, independent of WHERE it is
 * hosted. API ids / deployment names live in `hosting/`, never here.
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
