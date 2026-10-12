import { z } from "zod";

export const coverageRelationshipSchema = z.enum(["self", "spouse", "child", "other"]);

export const patientInsuranceSchema = z.object({
  payerId: z.string().trim().min(1, "Payer ID is required").max(100),
  planName: z.string().trim().max(150).optional(),
  memberId: z.string().trim().min(1, "Member ID is required").max(100),
  groupNumber: z.string().trim().max(100).optional(),
  relationship: coverageRelationshipSchema.optional(),
});

export const coverageSchema = patientInsuranceSchema;

export type CoverageRelationship = z.infer<typeof coverageRelationshipSchema>;
export type PatientInsuranceInput = z.infer<typeof patientInsuranceSchema>;
export type CoverageInput = z.infer<typeof coverageSchema>;
