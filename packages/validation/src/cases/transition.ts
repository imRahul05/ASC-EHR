import { z } from "zod";

export const transitionCaseSchema = z.object({
  to: z.string().trim().min(1, "Target stage or phase is required"),
  reason: z.string().trim().max(500).optional(),
  overrideReason: z.string().trim().max(500).optional(),
});

export type TransitionCaseInput = z.infer<typeof transitionCaseSchema>;
