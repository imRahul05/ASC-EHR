/**
 * Building blocks for provider/model configuration.
 *
 * A provider file declares its metadata AND its models in one `defineProvider`
 * call. Each model becomes a `ModelRef` that carries its provider name, so the
 * routing table references models as objects (`Models.anthropic.opus55`) —
 * a provider/model mismatch cannot compile.
 */

import type { LanguageModel } from 'ai';

/** What you write per model inside `defineProvider({ models: { ... } })`. */
export interface ModelSpec {
  /** Provider's model id, exactly as the API expects it. */
  id: string;
  label: string;
  description: string;
  /** Deprecated models stay listed (for history/UI) but are never routed to. */
  deprecated?: boolean;
}

/** A model bound to its provider. Routing tables are lists of these. */
export interface ModelRef<P extends string = string> extends ModelSpec {
  provider: P;
  /** Key of the model inside its provider definition (e.g. `opus55`). */
  key: string;
}

/** Provider metadata the router needs at runtime. */
export interface ProviderRuntime<P extends string = string> {
  name: P;
  displayName: string;
  /**
   * Whether a signed HIPAA Business Associate Agreement (BAA) covers the
   * account/endpoint `createModel` talks to. Calls with PHI are ONLY routed to
   * providers where this is `true`. Flip it only after the BAA is
   * countersigned — this is a compliance control, not a feature toggle.
   */
  baa: boolean;
  createModel: (modelId: string) => LanguageModel;
}

export type ProviderDefinition<
  P extends string,
  M extends Record<string, ModelSpec>,
> = ProviderRuntime<P> & {
  models: { readonly [K in keyof M]: ModelRef<P> & M[K] & { key: K } };
};

export function defineProvider<
  const P extends string,
  const M extends Record<string, ModelSpec>,
>(definition: ProviderRuntime<P> & { models: M }): ProviderDefinition<P, M> {
  const models = Object.fromEntries(
    Object.entries(definition.models).map(([key, spec]) => [
      key,
      { ...spec, key, provider: definition.name },
    ]),
  ) as ProviderDefinition<P, M>['models'];
  return { ...definition, models };
}
