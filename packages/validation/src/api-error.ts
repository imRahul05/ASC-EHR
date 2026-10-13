import { z } from "zod";

export const duplicateCandidateMatchSchema = z.object({
  patientId: z.string(),
  confidence: z.enum(["exact_identifier", "high", "possible"]),
  score: z.number(),
  reasons: z.array(z.string()),
});

export const duplicateMatchResultSchema = z.object({
  hasMatch: z.boolean(),
  highestConfidence: z.enum(["exact_identifier", "high", "possible", "none"]),
  matches: z.array(duplicateCandidateMatchSchema),
});

/** Error body of any non-2xx API response. Mirrors `ApiErrorPayload` in @asc/types. */
export const apiErrorPayloadSchema = z
  .object({
    message: z.string().optional(),
    code: z.string().optional(),
    details: z.record(z.string(), z.string()).optional(),
    duplicateMatch: duplicateMatchResultSchema.optional(),
  })
  .passthrough();
