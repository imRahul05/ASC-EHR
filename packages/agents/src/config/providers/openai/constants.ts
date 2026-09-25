export const OPENAI_MODELS = {
  // GPT-6 family (Sep 2026)
  GPT_6_ASTRA: 'gpt-6-astra',
  GPT_6_SOL: 'gpt-6-sol',
  GPT_6_LUNA: 'gpt-6-luna',
  
  // GPT-5.6 family (legacy, still available)
  GPT_5_6_SOL: 'gpt-5.6-sol',
  GPT_5_6_LUNA: 'gpt-5.6-luna',
} as const;

// Utility type for extracting the values of the constants
export type OpenAIModelId = typeof OPENAI_MODELS[keyof typeof OPENAI_MODELS];
