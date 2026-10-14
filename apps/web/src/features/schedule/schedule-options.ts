import type { ProcedureIntentInput } from "@asc/validation/cases/book";
import type { SegmentedOption, SelectOption } from "@asc/ui";

/** Standard ASC procedure suites inventory (room-1 through room-4) per P15 specification. */
export const ASC_ROOMS: readonly { readonly id: string; readonly name: string }[] = [
  { id: "room-1", name: "Room 1" },
  { id: "room-2", name: "Room 2" },
  { id: "room-3", name: "Room 3" },
  { id: "room-4", name: "Room 4" },
];

/** Standard ASC rooms (room-1 through room-4) segmented options. */
export const ROOM_OPTIONS: readonly SegmentedOption<string>[] = ASC_ROOMS.map((r) => ({
  value: r.id,
  label: r.name,
}));

/** Selectable GI CPT codes for primary procedure per P15b specification. */
export const GI_CPT_PROCEDURE_OPTIONS: readonly SelectOption<string>[] = [
  { value: "45378", label: "45378 · Diagnostic Colonoscopy", hint: "Diagnostic colonoscopy, flexible" },
  { value: "43239", label: "43239 · Upper GI Endoscopy (EGD)", hint: "EGD with biopsy" },
  { value: "45385", label: "45385 · Colonoscopy w/ Polypectomy", hint: "Lesion removal / snare polypectomy" },
  { value: "45380", label: "45380 · Colonoscopy w/ Biopsy", hint: "Single or multiple biopsies" },
  { value: "43235", label: "43235 · Diagnostic EGD", hint: "Diagnostic esophagogastroduodenoscopy" },
  { value: "45330", label: "45330 · Flexible Sigmoidoscopy", hint: "Diagnostic flexible sigmoidoscopy" },
];

/** Default scheduled duration in minutes keyed by primary procedure CPT code. */
export const DEFAULT_DURATION_BY_CPT: Readonly<Record<string, number>> = {
  "45378": 45,
  "43239": 30,
  "45385": 45,
  "45380": 45,
  "43235": 30,
  "45330": 30,
};

export function defaultDurationForCpt(cptCode?: string): number {
  if (!cptCode) return 45;
  return DEFAULT_DURATION_BY_CPT[cptCode] ?? 45;
}


export const INTENT_OPTIONS: readonly SegmentedOption<ProcedureIntentInput>[] = [
  { value: "screening", label: "Screening" },
  { value: "surveillance", label: "Surveillance" },
  { value: "diagnostic", label: "Diagnostic" },
  { value: "therapeutic", label: "Therapeutic" },
];

/** Duration segmented control options: 15, 30, 45, 60, 90, 120 mins. */
export const DURATION_OPTIONS: readonly SegmentedOption<number>[] = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "60 min" },
  { value: 90, label: "90 min" },
  { value: 120, label: "120 min" },
];

export const DEFAULT_START_TIME = "09:00";
export const DEFAULT_ROOM_ID = "room-1";
export const DEFAULT_PRIMARY_PROCEDURE = "45378";

/** Grid covers the ASC clinic day: 07:00 – 17:00. */
export const CLINIC_START_HOUR = 7;
export const CLINIC_END_HOUR = 17;
