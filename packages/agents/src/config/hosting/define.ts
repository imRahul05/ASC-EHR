/**
 * Hosting targets — WHERE models are served from.
 *
 * A target (e.g. `direct` vendor APIs, later Azure or AWS) has one or more
 * endpoints and binds each logical model it can serve to an endpoint + the
 * id/deployment name that endpoint expects. The app picks one target at startup.
 */

import type { LanguageModel } from 'ai';

import type { ModelName } from '../models.js';

export interface Endpoint {
  displayName: string;
  /**
   * Whether a signed HIPAA Business Associate Agreement (BAA) covers THIS
   * endpoint (account / resource / region). Calls with PHI are only routed to
   * endpoints where this is `true`. Flip it only after the BAA is
   * countersigned — this is a compliance control, not a feature toggle.
   */
  baa: boolean;
  createModel: (modelId: string) => LanguageModel;
}

export interface ModelBinding<E extends string = string> {
  endpoint: E;
  /** Model id or deployment name exactly as this endpoint's API expects it. */
  id: string;
}

export interface HostingTarget<E extends string = string> {
  name: string;
  displayName: string;
  endpoints: Readonly<Record<E, Endpoint>>;
  /** Logical model name → where it runs on this target. Unbound models are not available here. */
  models: Readonly<Partial<Record<string, ModelBinding<E>>>>;
}

/**
 * Typed helper for production targets: endpoint names are checked in every
 * binding and model names must exist in `Models`.
 */
export function defineHostingTarget<const E extends string>(target: {
  name: string;
  displayName: string;
  endpoints: Record<E, Endpoint>;
  models: Partial<Record<ModelName, ModelBinding<NoInfer<E>>>>;
}): HostingTarget<E> {
  return target;
}
