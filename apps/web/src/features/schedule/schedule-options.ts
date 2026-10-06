import type { ProcedureCode, ProcedureIntent, ParticipantRole } from "@asc/types";
import type { SegmentedOption, SelectOption } from "@asc/ui";
import { CASE_DURATIONS_MIN } from "@asc/validation/schedule";

/** Select / segmented options for booking (UI labels only; values are the shared enums). */
export const PROCEDURE_OPTIONS: readonly SelectOption<ProcedureCode>[] = [
  { value: "COLONOSCOPY", label: "Colonoscopy", hint: "45378 / 45385" },
  { value: "EGD", label: "EGD", hint: "43239" },
  { value: "EGD_COLONOSCOPY", label: "EGD + colonoscopy", hint: "bidirectional" },
  { value: "FLEX_SIG", label: "Flexible sigmoidoscopy", hint: "45330" },
];

export const INTENT_OPTIONS: readonly SegmentedOption<ProcedureIntent>[] = [
  { value: "screening", label: "Screening" },
  { value: "surveillance", label: "Surveillance" },
  { value: "diagnostic", label: "Diagnostic" },
];

export const DURATION_OPTIONS: readonly SegmentedOption<(typeof CASE_DURATIONS_MIN)[number]>[] = CASE_DURATIONS_MIN.map((minutes) => ({
  value: minutes,
  label: `${minutes} min`,
}));

/** Default indication per intent — the scheduler edits it; the referral reason wins when present. */
export const DEFAULT_INDICATION: Readonly<Record<ProcedureIntent, string>> = {
  screening: "Average-risk colorectal cancer screening",
  surveillance: "Surveillance after prior adenoma",
  diagnostic: "Diagnostic evaluation",
};

/** Team slots on the booking form → staff role that fills them. */
export const TEAM_FIELDS = [
  { name: "surgeonId", label: "Gastroenterologist", role: "SURGEON" },
  { name: "anesthesiaId", label: "Anesthesia", role: "ANESTHESIOLOGIST" },
  { name: "nurseId", label: "Nurse", role: "NURSE" },
] as const satisfies readonly { name: string; label: string; role: ParticipantRole }[];

export const DEFAULT_START_TIME = "09:30";
export const DEFAULT_ROOM_ID = "room-2";

/** Grid always covers the clinic day; widens when cases fall outside it. */
export const CLINIC_START_HOUR = 7;
export const CLINIC_END_HOUR = 18;
