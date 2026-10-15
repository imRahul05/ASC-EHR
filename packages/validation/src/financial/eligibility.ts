/**
 * Eligibility (X12 270/271) Contracts
 *
 * Implements HIPAA ANSI ASC X12 270/271 Real-Time Eligibility Verification.
 * Ensures benefit coverage breakdown (deductibles, copays, out-of-pocket maximums,
 * in-network status, and subscriber relationship).
 *
 * Strict Integer Cents:
 * All financial fields represent monetary values in integer cents (e.g., 50000 = $500.00).
 *
 * Handling Degraded Responses:
 * Status "incomplete" is enforced when 271 responses lack GI endoscopy service type (33/30)
 * or provide only high-level plan summaries without benefit levels.
 */

import { z } from "zod";

import { subscriberRelationshipSchema, type SubscriberRelationship } from "../patient.js";

export const FHIR_ID_REGEX = /^[A-Za-z0-9.-]{1,64}$/;

export const eligibilityStatusSchema = z.enum([
  "active",
  "inactive",
  "incomplete",
  "error",
]);

export type EligibilityStatus = z.infer<typeof eligibilityStatusSchema>;

export { subscriberRelationshipSchema, type SubscriberRelationship };

export const eligibilityCheckRequestSchema = z.object({
  caseId: z.string().regex(FHIR_ID_REGEX, "Invalid case ID format"),
  forceRefresh: z.boolean().optional(),
  serviceTypeCode: z.string().optional(), // HIPAA X12 270 Service Type Code (e.g. 30, 33)
});

export type EligibilityCheckRequest = z.infer<typeof eligibilityCheckRequestSchema>;

export const eligibilityResponseSchema = z.object({
  status: eligibilityStatusSchema,
  planName: z.string().min(1, "Plan name is required"),
  planType: z.string().min(1, "Plan type is required"),
  effectiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, "effectiveDate must be ISO date (YYYY-MM-DD)"),
  terminationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, "terminationDate must be ISO date (YYYY-MM-DD)")
    .optional(),
  subscriberRelationship: subscriberRelationshipSchema,
  inNetwork: z.boolean(),
  individualDeductibleCents: z
    .number()
    .int()
    .nonnegative("individualDeductibleCents must be non-negative integer"),
  individualDeductibleRemainingCents: z
    .number()
    .int()
    .nonnegative("individualDeductibleRemainingCents must be non-negative integer"),
  familyDeductibleCents: z
    .number()
    .int()
    .nonnegative("familyDeductibleCents must be non-negative integer")
    .optional(),
  familyDeductibleRemainingCents: z
    .number()
    .int()
    .nonnegative("familyDeductibleRemainingCents must be non-negative integer")
    .optional(),
  copayCents: z.number().int().nonnegative("copayCents must be non-negative integer"),
  coinsurancePercent: z
    .number()
    .min(0, "coinsurancePercent cannot be negative")
    .max(100, "coinsurancePercent cannot exceed 100"),
  outOfPocketMaxCents: z
    .number()
    .int()
    .nonnegative("outOfPocketMaxCents must be non-negative integer"),
  outOfPocketRemainingCents: z
    .number()
    .int()
    .nonnegative("outOfPocketRemainingCents must be non-negative integer"),
  rawPayload: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  checkedAt: z.string().datetime(),
});

export type EligibilityResponse = z.infer<typeof eligibilityResponseSchema>;

// Re-export estimate and prior-auth contracts from eligibility module for unified access
export * from "./prior-auth.js";
export * from "./estimate.js";
