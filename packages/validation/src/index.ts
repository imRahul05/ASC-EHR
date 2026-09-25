import { z } from "zod";

// Shared schemas for frontend and backend
export const baseSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// GET /health — shared by apps/api (response) and @repo/api-client (parsing)
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

// AI agent outputs (@repo/agents) — returned by apps/api, rendered by apps/web
export {
  dischargeInstructionsOutputSchema,
  patientLanguageSchema,
  type DischargeInstructionsOutput,
  type PatientLanguage,
} from "./agents/discharge-instructions.js";
