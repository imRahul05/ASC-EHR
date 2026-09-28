import type { FieldConfig, SegmentedOption, SelectOption } from "@asc/ui";
import type { PatientRegistrationFormData } from "@asc/validation/patient";

type TextFieldName = Exclude<keyof PatientRegistrationFormData, "sex" | "subscriberRelationship" | "escortConfirmed">;

/** One registration section = a card with text inputs rendered from config (selects/switches added per section). */
export const REGISTRATION_SECTIONS = [
  {
    id: "demographics",
    title: "Demographics",
    description: "Legal name and date of birth drive the duplicate check.",
    fields: [
      { name: "firstName", label: "First name", autoComplete: "off" },
      { name: "lastName", label: "Last name", autoComplete: "off" },
      { name: "dateOfBirth", label: "Date of birth", type: "date" },
      { name: "phone", label: "Phone", type: "tel", placeholder: "(555) 0100-0000" },
      { name: "email", label: "Email (optional)", type: "email" },
      { name: "preferredLanguage", label: "Preferred language" },
    ],
  },
  {
    id: "address",
    title: "Address",
    description: "Optional for booking; required before the claim export.",
    fields: [
      { name: "addressLine", label: "Street address" },
      { name: "city", label: "City" },
      { name: "state", label: "State", maxLength: 2 },
      { name: "postalCode", label: "ZIP", mono: true, maxLength: 10 },
    ],
  },
  {
    id: "coverage",
    title: "Coverage",
    description: "Eligibility (X12 270/271) runs right after registration.",
    fields: [
      { name: "payer", label: "Payer" },
      { name: "planName", label: "Plan" },
      { name: "memberId", label: "Member ID", mono: true },
      { name: "groupNumber", label: "Group # (optional)", mono: true },
    ],
  },
  {
    id: "escort",
    title: "Escort",
    description: "A responsible adult must drive the patient home after sedation.",
    fields: [
      { name: "escortName", label: "Escort name" },
      { name: "escortRelationship", label: "Relationship" },
      { name: "escortPhone", label: "Escort phone", type: "tel" },
    ],
  },
  {
    id: "clinical",
    title: "Referral & allergies",
    description: "Medications are reconciled by nursing at pre-procedure.",
    fields: [
      { name: "referringProvider", label: "Referring provider" },
      { name: "allergies", label: "Allergies (comma-separated, reaction in brackets)", placeholder: "penicillin (rash), sulfa" },
    ],
  },
] as const satisfies readonly {
  id: string;
  title: string;
  description: string;
  fields: readonly FieldConfig<TextFieldName>[];
}[];

export const SEX_OPTIONS: readonly SegmentedOption<PatientRegistrationFormData["sex"]>[] = [
  { value: "F", label: "Female" },
  { value: "M", label: "Male" },
  { value: "X", label: "Other / X" },
];

export const RELATIONSHIP_OPTIONS: readonly SelectOption<PatientRegistrationFormData["subscriberRelationship"]>[] = [
  { value: "self", label: "Self" },
  { value: "spouse", label: "Spouse" },
  { value: "child", label: "Child" },
  { value: "other", label: "Other" },
];

/** Fields whose change re-runs the duplicate check (on blur). */
export const DUPLICATE_KEYS = ["firstName", "lastName", "dateOfBirth"] as const;
