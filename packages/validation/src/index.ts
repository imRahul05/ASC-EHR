import { z } from "zod";

// Shared schemas for frontend and backend
export const baseSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
