import { z } from "zod";

// Patient registration (front desk) — demographics, coverage, escort. Shared by apps/web and apps/api.
// Payload helpers return plain objects shaped like `CreatePatientPayload` in @asc/types.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE = /^[+()\d\s.-]{7,20}$/;
const optionalText = z.string().trim().max(200);

export const sexSchema = z.enum(["F", "M", "X"]);
export const subscriberRelationshipSchema = z.enum(["self", "spouse", "child", "other"]);

export const patientRegistrationSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").max(80),
    lastName: z.string().trim().min(1, "Last name is required").max(80),
    dateOfBirth: z
      .string()
      .regex(ISO_DATE, "Enter a valid date of birth")
      .refine((value) => Date.parse(value) < Date.now(), "Date of birth must be in the past"),
    sex: sexSchema,
    phone: z.string().trim().regex(PHONE, "Enter a reachable phone number"),
    email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
    preferredLanguage: z.string().trim().min(1, "Preferred language is required"),
    addressLine: optionalText,
    city: optionalText,
    state: optionalText,
    postalCode: optionalText,
    payer: optionalText,
    planName: optionalText,
    memberId: optionalText,
    groupNumber: optionalText,
    subscriberRelationship: subscriberRelationshipSchema,
    escortName: optionalText,
    escortRelationship: optionalText,
    escortPhone: optionalText,
    escortConfirmed: z.boolean(),
    referringProvider: optionalText,
    /** Free-text medication list as written on a referral, e.g. "warfarin 5 mg daily, metformin 500 mg BID". */
    medications: optionalText,
    /** Free-text allergy list as written on a referral, e.g. "penicillin (rash), sulfa". "NKDA" = none. */
    allergies: optionalText,
  })
  .superRefine((data, ctx) => {
    const coverageStarted = data.payer !== "" || data.memberId !== "";
    if (coverageStarted && data.payer === "") ctx.addIssue({ code: "custom", path: ["payer"], message: "Payer is required with a member ID" });
    if (coverageStarted && data.memberId === "") ctx.addIssue({ code: "custom", path: ["memberId"], message: "Member ID is required for eligibility" });
    const escortStarted = data.escortName !== "" || data.escortPhone !== "";
    if (escortStarted && data.escortName.length < 2) ctx.addIssue({ code: "custom", path: ["escortName"], message: "Enter the escort's full name" });
    if (escortStarted && !PHONE.test(data.escortPhone)) ctx.addIssue({ code: "custom", path: ["escortPhone"], message: "Enter the escort's phone" });
    if (escortStarted && data.escortRelationship === "") {
      ctx.addIssue({ code: "custom", path: ["escortRelationship"], message: "Relationship is required" });
    }
  });

export type PatientRegistrationFormData = z.infer<typeof patientRegistrationSchema>;

export const EMPTY_PATIENT_REGISTRATION: PatientRegistrationFormData = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  sex: "F",
  phone: "",
  email: "",
  preferredLanguage: "English",
  addressLine: "",
  city: "",
  state: "",
  postalCode: "",
  payer: "",
  planName: "",
  memberId: "",
  groupNumber: "",
  subscriberRelationship: "self",
  escortName: "",
  escortRelationship: "",
  escortPhone: "",
  escortConfirmed: false,
  referringProvider: "",
  medications: "",
  allergies: "",
};

const NO_KNOWN_ALLERGIES = /^(nkda|none( known)?|no known( drug)? allergies)$/i;

/** "penicillin (rash), sulfa" → [{ substance: "penicillin", reaction: "rash" }, { substance: "sulfa", reaction: "unknown" }]. */
export function parseAllergyText(text: string): { substance: string; reaction: string; severity: "mild" | "moderate" | "severe" }[] {
  const trimmed = text.trim();
  if (trimmed === "" || NO_KNOWN_ALLERGIES.test(trimmed)) return [];
  return trimmed
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => {
      const match = /^(.*?)\s*\((.*)\)\s*$/.exec(part);
      const substance = (match?.[1] ?? part).trim();
      const reaction = (match?.[2] ?? "unknown").trim();
      return { substance, reaction, severity: /anaphyla/i.test(reaction) ? "severe" : "moderate" };
    });
}

const DOSE = /^(.*?)\s+(\d[\d.,]*\s*(?:mg|mcg|g|mL|units?|IU))\b\s*(.*)$/i;

/** "warfarin 5 mg daily (AFib), levothyroxine 75 mcg" → [{ name: "warfarin", dose: "5 mg", frequency: "daily" }, …]. */
export function parseMedicationText(text: string): { name: string; dose: string; frequency: string }[] {
  return text
    .split(/[,;]/)
    .map((part) => part.replace(/\(.*?\)/g, "").trim())
    .filter((part) => part !== "" && !/^(none|no medications?)$/i.test(part))
    .map((part) => {
      const match = DOSE.exec(part);
      if (!match) return { name: part, dose: "", frequency: "" };
      return { name: (match[1] ?? part).trim(), dose: (match[2] ?? "").trim(), frequency: (match[3] ?? "").trim() };
    });
}

const orUndefined = (value: string) => (value === "" ? undefined : value);

/** Form values → `CreatePatientPayload` (@asc/types). Optional blocks are omitted when empty. */
export function toCreatePatientPayload(data: PatientRegistrationFormData, referralId?: string) {
  const hasAddress = data.addressLine !== "" && data.city !== "";
  return {
    firstName: data.firstName,
    lastName: data.lastName,
    dateOfBirth: data.dateOfBirth,
    sex: data.sex,
    phone: data.phone,
    email: orUndefined(data.email),
    preferredLanguage: data.preferredLanguage,
    address: hasAddress ? { line: data.addressLine, city: data.city, state: data.state, postalCode: data.postalCode } : undefined,
    coverage:
      data.payer !== ""
        ? {
            payer: data.payer,
            planName: data.planName,
            memberId: data.memberId,
            groupNumber: orUndefined(data.groupNumber),
            subscriberRelationship: data.subscriberRelationship,
          }
        : undefined,
    escort:
      data.escortName !== ""
        ? { name: data.escortName, relationship: data.escortRelationship, phone: data.escortPhone, confirmed: data.escortConfirmed }
        : undefined,
    allergies: parseAllergyText(data.allergies),
    referringProvider: orUndefined(data.referringProvider),
    referralId,
  };
}
