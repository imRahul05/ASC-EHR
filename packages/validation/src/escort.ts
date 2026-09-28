import { z } from "zod";

// Escort (responsible adult who drives the patient home after sedation) — portal and registration forms.

export const escortSchema = z.object({
  name: z.string().trim().min(2, "Enter your escort's full name"),
  relationship: z.string().trim().min(2, "How is this person related to you?"),
  phone: z
    .string()
    .trim()
    .regex(/^[+()\d\s.-]{7,20}$/, "Enter a phone number we can reach on the day"),
  confirmed: z.boolean(),
});

export type EscortFormData = z.infer<typeof escortSchema>;
