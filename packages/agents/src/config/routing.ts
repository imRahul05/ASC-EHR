import type { ReasoningTier, RoutingTable, TaskType } from './types.js';
import { OPENAI_MODELS } from './providers/openai/constants.js';
import { ANTHROPIC_MODELS } from './providers/anthropic/constants.js';
import { GOOGLE_MODELS } from './providers/google/constants.js';

/**
 * Ordered fallback chains per tier. For calls with `containsPhi: true` the
 * gateway filters each chain down to providers whose catalog has `baa: true`.
 */
export const ROUTING_TABLE: RoutingTable = {
  high: [
    { provider: 'anthropic', modelKey: ANTHROPIC_MODELS.CLAUDE_OPUS_5_5 },
    { provider: 'openai',    modelKey: OPENAI_MODELS.GPT_6_ASTRA },
    { provider: 'anthropic', modelKey: ANTHROPIC_MODELS.CLAUDE_FABLE_5_1 },
  ],

  medium: [
    { provider: 'openai',    modelKey: OPENAI_MODELS.GPT_6_SOL },
    { provider: 'anthropic', modelKey: ANTHROPIC_MODELS.CLAUDE_SONNET_5 },
    { provider: 'openai',    modelKey: OPENAI_MODELS.GPT_5_6_SOL },
    { provider: 'google',    modelKey: GOOGLE_MODELS.GEMINI_3_8_FLASH },
  ],

  low: [
    { provider: 'google',    modelKey: GOOGLE_MODELS.GEMINI_3_5_FLASH_LITE },
    { provider: 'openai',    modelKey: OPENAI_MODELS.GPT_6_LUNA },
    { provider: 'anthropic', modelKey: ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5 },
    { provider: 'openai',    modelKey: OPENAI_MODELS.GPT_5_6_LUNA },
  ],
};

export const TASK_TIER_MAP: Record<TaskType, ReasoningTier> = {
  'medical-coding':       'high',
  'diagnostic-reasoning': 'high',
  'summarization':        'medium',
  'data-extraction':      'low',
  'validation':           'low',
  'classification':       'low',
  'general':              'medium',
};
