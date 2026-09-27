import type { AgentSetting, BlockTemplate, Room, StaffMember } from "@asc/types";

/** Synthetic roster. Ids of the demo-login personas match MOCK_USER_PROFILES in ../data/users. */
export const STAFF = {
  vance: {
    id: "usr_surgeon_01",
    name: "Dr. Arthur Vance",
    initials: "AV",
    role: "SURGEON",
    title: "Attending Gastroenterologist",
    npi: "1093847261",
    active: true,
    email: "surgeon@ascehr.demo",
  },
  nair: {
    id: "stf_surgeon_02",
    name: "Dr. Priya Nair",
    initials: "PN",
    role: "SURGEON",
    title: "Gastroenterologist",
    npi: "1184736250",
    active: true,
    email: "p.nair@ascehr.demo",
  },
  okafor: {
    id: "stf_surgeon_03",
    name: "Dr. Samuel Okafor",
    initials: "SO",
    role: "SURGEON",
    title: "Gastroenterologist",
    npi: "1265839402",
    active: true,
    email: "s.okafor@ascehr.demo",
  },
  rostova: {
    id: "usr_anesthesia_01",
    name: "Dr. Elena Rostova",
    initials: "ER",
    role: "ANESTHESIOLOGIST",
    title: "Staff Anesthesiologist",
    npi: "1482910384",
    active: true,
    email: "anesthesia@ascehr.demo",
  },
  whitfield: {
    id: "stf_crna_02",
    name: "James Whitfield, CRNA",
    initials: "JW",
    role: "ANESTHESIOLOGIST",
    title: "Certified Registered Nurse Anesthetist",
    npi: "1356920184",
    active: true,
    email: "j.whitfield@ascehr.demo",
  },
  jenkins: {
    id: "usr_nurse_01",
    name: "Sarah Jenkins, RN",
    initials: "SJ",
    role: "NURSE",
    title: "Lead Circulating & PACU RN",
    active: true,
    email: "nurse@ascehr.demo",
  },
  delgado: {
    id: "stf_nurse_02",
    name: "Maria Delgado, RN",
    initials: "MD",
    role: "NURSE",
    title: "Pre-op RN",
    active: true,
    email: "m.delgado@ascehr.demo",
  },
  tran: {
    id: "stf_nurse_03",
    name: "Kevin Tran, RN",
    initials: "KT",
    role: "NURSE",
    title: "Procedure RN",
    active: true,
    email: "k.tran@ascehr.demo",
  },
  mvance: {
    id: "usr_admin_01",
    name: "Marcus Vance",
    initials: "MV",
    role: "ADMIN",
    title: "ASC Center Director",
    active: true,
    email: "admin@ascehr.demo",
  },
  price: {
    id: "stf_coder_01",
    name: "Dana Price, CPC",
    initials: "DP",
    role: "ADMIN",
    title: "Certified Coder",
    active: true,
    email: "d.price@ascehr.demo",
  },
  chen: {
    id: "stf_frontdesk_01",
    name: "Lisa Chen",
    initials: "LC",
    role: "ADMIN",
    title: "Front Desk & Scheduling",
    active: true,
    email: "l.chen@ascehr.demo",
  },
} as const satisfies Record<string, StaffMember>;

export const STAFF_LIST: readonly StaffMember[] = Object.values(STAFF);

/** Demo PATIENT login → their chart. */
export const PORTAL_PATIENT_BY_USER: Readonly<Record<string, string>> = {
  usr_patient_01: "pat_105",
};

export const ROOMS: readonly Room[] = [
  { id: "room-1", name: "Room 1", status: "idle" },
  { id: "room-2", name: "Room 2", status: "idle" },
  { id: "room-3", name: "Room 3", status: "idle" },
];

export const BLOCKS: readonly BlockTemplate[] = [1, 2, 3, 4, 5].flatMap((day) => [
  { id: `blk_${day}_1`, roomId: "room-1", dayOfWeek: day, start: "07:00", end: "15:00", surgeonId: STAFF.vance.id },
  { id: `blk_${day}_2`, roomId: "room-2", dayOfWeek: day, start: "07:00", end: "15:00", surgeonId: STAFF.nair.id },
  { id: `blk_${day}_3`, roomId: "room-3", dayOfWeek: day, start: "08:00", end: "13:00", surgeonId: STAFF.okafor.id },
]);

/** Read-only view of the AI agents (real config lives in @asc/agents; not imported into the browser). */
export const AGENT_SETTINGS: readonly AgentSetting[] = [
  {
    agent: "referral_extraction",
    label: "Referral intake",
    model: "Tier: fast (BAA-hosted)",
    promptVersion: "referral_extraction@1.3.0",
    enabled: true,
    description: "Extracts demographics, reason and meds from faxed referrals with source spans.",
  },
  {
    agent: "pre_visit_brief",
    label: "Pre-visit brief",
    model: "Tier: balanced (BAA-hosted)",
    promptVersion: "pre_visit_brief@1.1.0",
    enabled: true,
    description: "Summarises history, anticoagulants and risk flags for the H&P.",
  },
  {
    agent: "procedure_note",
    label: "Procedure note",
    model: "Tier: deep (BAA-hosted)",
    promptVersion: "procedure_note@2.4.1",
    enabled: true,
    description: "Drafts the colonoscopy/EGD note from room events, specimens and narration (draft-first).",
  },
  {
    agent: "note_critic",
    label: "Note critic",
    model: "Tier: balanced (BAA-hosted)",
    promptVersion: "note_critic@1.0.3",
    enabled: true,
    description: "Suggests fixes and gaps; never overwrites clinician edits.",
  },
  {
    agent: "coding",
    label: "Coding assistant",
    model: "Tier: deep (BAA-hosted)",
    promptVersion: "coding@1.6.0",
    enabled: true,
    description: "Suggests CPT/ICD-10/modifiers with evidence links; coder attests.",
  },
  {
    agent: "discharge_instructions",
    label: "Discharge instructions",
    model: "Tier: fast (BAA-hosted)",
    promptVersion: "discharge_instructions@1.2.0",
    enabled: true,
    description: "Plain-language discharge instructions at a 6th-grade reading level.",
  },
];
