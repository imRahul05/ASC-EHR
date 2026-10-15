/**
 * Prior Authorization (X12 278) Contracts
 *
 * Implements HIPAA ANSI ASC X12 278 Health Care Services Review validation.
 * Prior authorization validity is bound to specific CPT codes, unit counts,
 * and calendar date ranges.
 */

import { z } from "zod";

export const priorAuthStatusSchema = z.enum([
  "approved",
  "denied",
  "pending",
  "not_required",
]);

export type PriorAuthStatus = z.infer<typeof priorAuthStatusSchema>;

/**
 * Validates prior authorization details obtained from an X12 278 response
 * or direct payer portal entry.
 */
export const priorAuthCheckSchema = z.object({
  authNumber: z.string().min(1, "Prior auth number is required"),
  status: priorAuthStatusSchema,
  validFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, "validFrom must be ISO date (YYYY-MM-DD)"),
  validTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, "validTo must be ISO date (YYYY-MM-DD)"),
  approvedCptCodes: z.array(
    z.string().regex(/^[0-9A-Z]{5}$/, "Must be valid 5-character CPT/HCPCS code")
  ),
  approvedUnits: z.number().int().positive("Approved units must be at least 1"),
  notes: z.string().optional(),
});

export type PriorAuthCheck = z.infer<typeof priorAuthCheckSchema>;
