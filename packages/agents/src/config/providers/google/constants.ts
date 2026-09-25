export const GOOGLE_MODELS = {
  GEMINI_3_8_FLASH: 'gemini-3.8-flash',
  GEMINI_3_5_FLASH_LITE: 'gemini-3.5-flash-lite',
} as const;

export type GoogleModelId = typeof GOOGLE_MODELS[keyof typeof GOOGLE_MODELS];
