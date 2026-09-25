/**
 * Logical model building blocks — WHAT a model is, independent of WHERE it is
 * hosted. API ids / deployment names live in `hosting/`, never here.
 */

/** Who builds the model (not who hosts it). */
export type ModelVendor = 'anthropic' | 'openai' | 'google';

/**
 * What a model can do beyond plain text in / text out. Calls and agents list
 * the capabilities they need (`requires`); the router drops models lacking any.
 */
export const Capability = {
  /** Image input. */
  Vision: 'vision',
  /** Tool / function calling. */
  Tools: 'tools',
  /** Schema-constrained JSON output (`executeAgentObject`, `runAgent`). */
  StructuredOutput: 'structured-output',
} as const;

export type ModelCapability = (typeof Capability)[keyof typeof Capability];

/**
 * Common capability sets. Every model's set must be verified against the
 * vendor's docs — a wrong `Vision` flag sends images to a model that cannot read them.
 */
export const TEXT_CAPABILITIES = [Capability.Tools, Capability.StructuredOutput] as const;
export const MULTIMODAL_CAPABILITIES = [Capability.Vision, ...TEXT_CAPABILITIES] as const;

export interface ModelSpec {
  vendor: ModelVendor;
  /** Display name for UIs and settings screens. */
  label: string;
  description: string;
  capabilities: readonly ModelCapability[];
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

export function hasCapabilities(model: ModelSpec, required: readonly ModelCapability[]): boolean {
  return required.every((capability) => model.capabilities.includes(capability));
}
