import type { JSONValue, LanguageModel } from 'ai';

/** Provider options keyed by SDK provider name (e.g. `openai`, `azure`), as the AI SDK expects them. */
export type EndpointProviderOptions = Readonly<Record<string, Readonly<Record<string, JSONValue>>>>;

/**
 * An endpoint = one Vercel AI SDK provider pointed at one account / resource.
 * It knows how to create a model from an id, and whether a BAA covers it.
 */
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
  /**
   * Provider options the gateway sends on EVERY call to this endpoint — for
   * compliance defaults that must never depend on the caller remembering them,
   * e.g. OpenAI / Azure OpenAI `store: false` (the Responses API otherwise
   * retains prompts and outputs server-side).
   */
  providerOptions?: EndpointProviderOptions;
  /**
   * How this endpoint caches a call's stable prompt prefix (the agent's
   * instructions). Applied only when the call has a `promptCacheKey`. Omit for
   * providers that cache prefixes automatically with nothing to configure.
   */
  promptCache?: EndpointPromptCache;
}

/**
 * Provider-specific prompt-cache options. Caching is performance only: it must
 * never keep conversation state at the provider (see `store: false`).
 */
export interface EndpointPromptCache {
  /**
   * Options attached to the instructions (system) message — a cache breakpoint
   * at the end of the shared prefix, before the per-case messages.
   */
  instructions?: EndpointProviderOptions;
  /**
   * Call-level options for a cache key. The key is non-PHI (agent name + prompt
   * version), so calls sharing a prefix are routed to the same cache.
   */
  call?: (cacheKey: string) => EndpointProviderOptions;
}
