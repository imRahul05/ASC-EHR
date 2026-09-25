import type { LanguageModel } from 'ai';

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
}
