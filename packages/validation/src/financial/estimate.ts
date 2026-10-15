/**
 * Good-Faith Estimate (GFE) & Copay Collection Contracts
 *
 * Implements disclosures under the No Surprises Act (45 CFR § 149) and
 * Patient Protection and Affordable Care Act (ACA 42 U.S.C. § 300gg-13).
 * Dual pricing is required for screening colonoscopies:
 * - Preventive baseline: $0 patient responsibility.
 * - Therapeutic contingency: deductible/coinsurance if polyps resected (CPT 45385 / modifier 33/PT).
 *
 * All financial amounts are strictly stored in integer cents to avoid floating-point errors.
 */

import { z } from "zod";

const FHIR_ID_REGEX = /^[A-Za-z0-9.-]{1,64}$/;

export const estimateDeliveryChannelSchema = z.enum([
  "sms",
  "email",
  "portal",
  "in_person",
]);

export type EstimateDeliveryChannel = z.infer<typeof estimateDeliveryChannelSchema>;

export const patientEstimateSchema = z.object({
  caseId: z.string().regex(FHIR_ID_REGEX, "Invalid case ID format"),
  expectedAllowedCents: z.number().int().nonnegative("expectedAllowedCents must be a non-negative integer"),
  preventiveCovered: z.boolean(),
  estimatedScreeningPatientOwedCents: z.number().int().nonnegative("estimatedScreeningPatientOwedCents must be non-negative integer"),
  estimatedTherapeuticPatientOwedCents: z.number().int().nonnegative("estimatedTherapeuticPatientOwedCents must be non-negative integer"),
  patientResponsibilityCents: z.number().int().nonnegative("patientResponsibilityCents must be non-negative integer"),
  deliveryChannel: estimateDeliveryChannelSchema,
  deliveredAt: z.string().datetime().optional(),
  acknowledgedAt: z.string().datetime().optional(),
});

export type PatientEstimate = z.infer<typeof patientEstimateSchema>;

export const paymentMethodSchema = z.enum([
  "credit_card",
  "debit_card",
  "cash",
  "check",
  "payment_plan",
]);

export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const paymentPlanDetailsSchema = z.object({
  monthlyCents: z.number().int().positive("monthlyCents must be positive integer"),
  numberOfMonths: z.number().int().positive("numberOfMonths must be positive integer"),
  firstDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "firstDueDate must be ISO date (YYYY-MM-DD)"),
});

export type PaymentPlanDetails = z.infer<typeof paymentPlanDetailsSchema>;

export const copayCollectionSchema = z.object({
  caseId: z.string().regex(FHIR_ID_REGEX, "Invalid case ID format"),
  amountCents: z.number().int().nonnegative("amountCents must be non-negative integer"),
  paymentMethod: paymentMethodSchema,
  transactionRef: z.string().optional(),
  paymentPlanDetails: paymentPlanDetailsSchema.optional(),
  notes: z.string().optional(),
});

export type CopayCollection = z.infer<typeof copayCollectionSchema>;
