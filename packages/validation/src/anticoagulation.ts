import { z } from "zod";

const FHIR_ID = /^[A-Za-z0-9._-]{1,64}$/;

export const anticoagulantDrugClassSchema = z.enum([
  "doac",
  "warfarin",
  "p2y12",
  "aspirin",
  "lmwh",
  "other",
]);
export type AnticoagulantDrugClass = z.infer<typeof anticoagulantDrugClassSchema>;

export const procedureBleedingRiskSchema = z.enum(["low", "high"]);
export type ProcedureBleedingRisk = z.infer<typeof procedureBleedingRiskSchema>;

export const anticoagulantMedicationItemSchema = z.object({
  medicationId: z.string().trim().min(1, "Medication ID is required").max(64),
  medicationName: z.string().trim().min(1, "Medication name is required").max(200),
  drugClass: anticoagulantDrugClassSchema.optional(),
  prescriberInstructionDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}/, "Must be valid date YYYY-MM-DD")
    .optional()
    .nullable(),
  prescriberInstruction: z.string().trim().max(500).optional().nullable(),
  prescriberName: z.string().trim().max(150).optional().nullable(),
  patientConfirmedHeld: z.boolean().optional().nullable(),
  lastDoseTakenAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}/, "Must be valid ISO date or date-time")
    .optional()
    .nullable(),
});

export interface AnticoagulantMedicationItem {
  readonly medicationId: string;
  readonly medicationName: string;
  readonly drugClass?: AnticoagulantDrugClass;
  readonly prescriberInstructionDate?: string | null;
  readonly prescriberInstruction?: string | null;
  readonly prescriberName?: string | null;
  readonly patientConfirmedHeld?: boolean | null;
  readonly lastDoseTakenAt?: string | null;
}

export const anticoagulationAssessmentSchema = z.object({
  caseId: z.string().trim().regex(FHIR_ID, "Case ID must be a valid FHIR identifier"),
  facilityId: z.string().trim().regex(FHIR_ID, "Facility ID must be a valid FHIR identifier"),
  hasAnticoagulants: z.boolean({
    required_error: "Must explicitly specify if patient takes anticoagulants or antiplatelets",
  }),
  procedureBleedingRisk: procedureBleedingRiskSchema,
  medications: z.array(anticoagulantMedicationItemSchema),
  assessedAt: z.string().datetime().optional(),
  assessorId: z.string().trim().regex(FHIR_ID, "Assessor ID must be a valid FHIR identifier").optional(),
  assessorName: z.string().trim().max(150).optional(),
});

export interface AnticoagulationAssessmentInput {
  readonly caseId: string;
  readonly facilityId: string;
  readonly hasAnticoagulants: boolean;
  readonly procedureBleedingRisk: ProcedureBleedingRisk;
  readonly medications: readonly AnticoagulantMedicationItem[];
  readonly assessedAt?: string;
  readonly assessorId?: string;
  readonly assessorName?: string;
}
