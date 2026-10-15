import { z } from "zod";

const FHIR_ID = /^[A-Za-z0-9._-]{1,64}$/;
const DATA_URL_PNG_PREFIX = "data:image/png;base64,";

// Known 1x1 transparent PNG base64 strings
const KNOWN_EMPTY_PNG_BASE64 = new Set([
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
]);

export const signerRelationshipSchema = z.enum(["patient", "legal_guardian", "healthcare_proxy"]);
export type SignerRelationship = z.infer<typeof signerRelationshipSchema>;

export const signatureDataUrlSchema = z
  .string()
  .trim()
  .min(1, "Patient signature is required")
  .refine((val) => val.startsWith(DATA_URL_PNG_PREFIX), {
    message: "Patient signature must be a valid PNG data URL",
  })
  .refine(
    (val) => {
      const base64Data = val.slice(DATA_URL_PNG_PREFIX.length).trim();
      if (base64Data.length === 0) return false;
      if (KNOWN_EMPTY_PNG_BASE64.has(base64Data)) return false;
      // An empty canvas of 1x1 or completely blank transparent canvas encodes to under 120 chars
      if (base64Data.length < 120) return false;
      return true;
    },
    {
      message: "Patient signature is required",
    },
  );

export const signConsentSchema = z.object({
  caseId: z
    .string()
    .trim()
    .regex(FHIR_ID, "Case ID must be a valid FHIR identifier"),
  procedureName: z.string().trim().min(1, "Procedure name is required").max(200),
  procedureCode: z.string().trim().min(1, "Procedure code is required").max(50),
  performingPhysicianName: z.string().trim().min(1, "Performing physician name is required").max(150),
  signerName: z.string().trim().min(1, "Signer name is required").max(150),
  signerRelationship: signerRelationshipSchema,
  signatureDataUrl: signatureDataUrlSchema,
  consentFormVersion: z.string().trim().min(1, "Consent form version is required").max(50),
  risksAcknowledged: z.literal(true, {
    errorMap: () => ({ message: "Risks acknowledgment is required" }),
  }),
  facilityId: z
    .string()
    .trim()
    .regex(FHIR_ID, "Facility ID must be a valid FHIR identifier"),
});

export interface SignConsentInput {
  readonly caseId: string;
  readonly procedureName: string;
  readonly procedureCode: string;
  readonly performingPhysicianName: string;
  readonly signerName: string;
  readonly signerRelationship: "patient" | "legal_guardian" | "healthcare_proxy";
  readonly signatureDataUrl: string;
  readonly consentFormVersion: string;
  readonly risksAcknowledged: true;
  readonly facilityId: string;
}
