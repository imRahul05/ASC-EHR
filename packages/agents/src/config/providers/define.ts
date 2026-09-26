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
}
