import { z } from "zod";

// GET /health — shared by apps/api (response) and @asc/api-client (parsing)
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
