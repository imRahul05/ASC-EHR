export const ANTHROPIC_MODELS = {
  CLAUDE_OPUS_5_5: 'claude-opus-5-5',
  CLAUDE_FABLE_5_1: 'claude-fable-5-1',
  CLAUDE_SONNET_5: 'claude-sonnet-5',
  CLAUDE_HAIKU_4_5: 'claude-haiku-4-5-20251001',
} as const;

export type AnthropicModelId = typeof ANTHROPIC_MODELS[keyof typeof ANTHROPIC_MODELS];
