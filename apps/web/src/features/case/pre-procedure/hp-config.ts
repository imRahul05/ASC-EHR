import type { AllergySeverity, AsaClass, HoldStatus, Mallampati, MedicationClass } from "@asc/types";
import { Ban, CircleCheck, CircleDashed, CircleMinus, type LucideIcon } from "@asc/ui/icons";

/** History / exam free-text fields of the H&P, rendered with `.map()`. */
export const HP_TEXT_FIELDS = [
  { name: "intervalHistory", label: "Interval history", placeholder: "Changes since referral, prep result, new symptoms", rows: 3 },
  { name: "heart", label: "Heart", placeholder: "e.g. Regular rate and rhythm, no murmur", rows: 1 },
  { name: "lungs", label: "Lungs", placeholder: "e.g. Clear to auscultation bilaterally", rows: 1 },
] as const;

export const ASA_OPTIONS: readonly { readonly value: AsaClass; readonly label: string; readonly hint: string }[] = [
  { value: 1, label: "ASA I", hint: "Healthy" },
  { value: 2, label: "ASA II", hint: "Mild systemic" },
  { value: 3, label: "ASA III", hint: "Severe systemic" },
  { value: 4, label: "ASA IV", hint: "Threat to life" },
];

export const MALLAMPATI_OPTIONS: readonly { readonly value: Mallampati; readonly label: string; readonly hint: string }[] = [
  { value: 1, label: "I", hint: "Full uvula, pillars" },
  { value: 2, label: "II", hint: "Uvula visible" },
  { value: 3, label: "III", hint: "Base of uvula" },
  { value: 4, label: "IV", hint: "Hard palate only" },
];

export const SEVERITY_META: Readonly<Record<AllergySeverity, { readonly label: string; readonly tone: string }>> = {
  severe: { label: "Severe", tone: "bg-destructive/10 text-destructive" },
  moderate: { label: "Moderate", tone: "bg-warning/10 text-warning" },
  mild: { label: "Mild", tone: "bg-muted text-muted-foreground" },
};

export const HOLD_STATUS_META: Readonly<Record<HoldStatus, { readonly label: string; readonly icon: LucideIcon; readonly tone: string }>> = {
  pending: { label: "Hold not confirmed", icon: CircleDashed, tone: "bg-warning/10 text-warning" },
  confirmed: { label: "Held — confirmed", icon: CircleCheck, tone: "bg-success/10 text-success" },
  not_held: { label: "Not held", icon: Ban, tone: "bg-destructive/10 text-destructive" },
  not_required: { label: "No hold needed", icon: CircleMinus, tone: "bg-muted text-muted-foreground" },
};

export const MED_CLASS_LABEL: Readonly<Record<MedicationClass, string>> = {
  anticoagulant: "Anticoagulant",
  antiplatelet: "Antiplatelet",
  glp1: "GLP-1 agonist",
  insulin: "Insulin",
  oral_hypoglycemic: "Oral hypoglycemic",
  iron: "Oral iron",
  other: "Other",
};

/** `2` days → `48 h`, `7` → `7 days` (short holds read better in hours at the bedside). */
export function holdWindowLabel(daysBefore: number): string {
  return daysBefore <= 2 ? `${daysBefore * 24} h` : `${daysBefore} days`;
}
