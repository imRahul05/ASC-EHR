import { PHASE_ORDER } from "@asc/clinical-rules";
import type { CaseDetail, CasePhase, UserRole } from "@asc/types";
import {
  Bot,
  ClipboardCheck,
  FileText,
  HeartHandshake,
  Inbox,
  LayoutDashboard,
  Stethoscope,
  type LucideIcon,
} from "@asc/ui/icons";

/**
 * All onboarding & help copy in one place (docs/product/07-mock-frontend.md §6, §7.5, §8).
 * Data only — components in features/guide render it. Record ids in links are seeded demo ids (synthetic).
 */

interface RecordLink {
  readonly label: string;
  readonly href: string;
  readonly hint?: string;
}

interface HelpEntry {
  readonly title: string;
  readonly purpose: string;
  readonly steps: readonly string[];
  readonly records?: readonly RecordLink[];
  /** Omit to derive from NAV_BY_ROLE. */
  readonly roles?: readonly UserRole[];
  readonly mocked: string;
  readonly production: string;
}

interface TabHelp extends HelpEntry {
  /** One line for the hint strip at the top of the tab. */
  readonly hint: string;
}

const STAFF: readonly UserRole[] = ["ADMIN", "NURSE", "SURGEON", "ANESTHESIOLOGIST"];

const caseLink = (caseId: string, tab: string, label: string, hint: string): RecordLink => ({
  label,
  href: `/cases/${caseId}?tab=${tab}`,
  hint,
});

/* ─── Page help, keyed by first path segment ───────────────────────────── */

export const ROUTE_HELP: Readonly<Record<string, HelpEntry>> = {
  dashboard: {
    title: "Dashboard",
    purpose: "Your home screen. It changes with the persona: center operations, nurse flow, surgeon slate or anesthesia queue.",
    steps: [
      "Scan the numbers at the top for today's volume and anything stuck.",
      "Open a case from the list to jump into its workspace.",
      "Switch persona (top right) to see how each role's home differs.",
    ],
    records: [caseLink("case_107", "pre-op", "Case 0917 · pre-op, not ready", "Readiness gate is failing")],
    mocked: "Numbers are computed from the in-memory demo data.",
    production: "Counts come from Medplum searches scoped by the user's access policy.",
  },
  schedule: {
    title: "Schedule",
    purpose: "Day board by room. Book cases, spot conflicts and open any case.",
    steps: [
      "Click Book case (or an empty slot) and search a patient.",
      "Pick colonoscopy, screening, a room and a time; conflicts show before you save.",
      "Click a case block to open its workspace. Use the arrows to change day.",
    ],
    records: [
      caseLink("case_109", "pre-procedure", "Case 0919 · scheduled", "Eligibility inactive — confirm gate fails until re-checked"),
      caseLink("case_105", "pre-procedure", "Case 0915 · confirmed", "Portal patient Robert Miller"),
    ],
    mocked: "Rooms, blocks and conflicts are checked by the mock API with the same rules the UI uses.",
    production: "Appointment + Encounter in Medplum; the API re-checks conflicts before saving.",
  },
  patients: {
    title: "Patients",
    purpose: "Find, register and review patients: demographics, coverage, eligibility, escort and past cases.",
    steps: [
      "Search by name or MRN, or click Register patient.",
      "Registration checks for duplicates before creating a new chart.",
      "In a chart, run Check eligibility to send a mock 270 and read the 271 result.",
    ],
    records: [
      { label: "Chart · pat_109", href: "/patients/pat_109", hint: "Coverage inactive — re-check eligibility" },
      { label: "Chart · pat_102", href: "/patients/pat_102", hint: "Angela Brooks — the duplicate-check example" },
    ],
    mocked: "Eligibility is a fake clearinghouse that answers instantly.",
    production: "Patient/Coverage in Medplum; X12 270/271 through the clearinghouse integration.",
  },
  referrals: {
    title: "Referrals",
    purpose: "Fax inbox. AI reads each fax and pulls out the facts; you check them against the page and create the patient.",
    steps: [
      "Open a referral on the left.",
      "Click an extracted fact to highlight where it came from on the fax.",
      "Create a new patient (or link an existing one), then book the case.",
    ],
    records: [],
    mocked: "Faxes and extracted facts are canned; nothing is sent to a model.",
    production: "Fax service → document store → extraction agent (via the AI gateway), always reviewed by staff.",
  },
  whiteboard: {
    title: "Whiteboard",
    purpose: "Live board of today's cases by phase. Shows initials and case number only, safe for a wall screen.",
    steps: [
      "Find the column for the phase you care about (arrived, pre-op, in room, recovery).",
      "Click a card to open the case and move it on.",
      "The board refreshes on its own every 15 seconds.",
    ],
    records: [caseLink("case_108", "pre-op", "Case 0918 · arrived", "GLP-1 hold to review")],
    mocked: "Polls the mock API every 15 s.",
    production: "Medplum subscriptions push changes; no polling.",
  },
  worklist: {
    title: "Worklist",
    purpose: "Everything waiting on a person: notes to sign, eligibility failures, referrals, pending pathology, coding.",
    steps: ["Filter by task type or status.", "Open a task to go straight to the screen that finishes it.", "Tasks close themselves when the work is done."],
    records: [caseLink("case_101", "note", "Case 0911 · note waiting to sign", "Blocking gap: bowel prep score")],
    mocked: "Tasks are generated by the mock API as cases move.",
    production: "FHIR Task resources created by the API and workers.",
  },
  pathology: {
    title: "Pathology",
    purpose: "Specimen results across cases: awaiting, received and reconciled.",
    steps: ["Open a case that is awaiting results.", "Record the result, reconcile it to the polyp, set the surveillance interval.", "Send the result letter, then close the case."],
    records: [
      caseLink("case_115", "pathology", "Case 0871 · awaiting results", "Two jars, no results yet"),
      caseLink("case_113", "pathology", "Case 0897 · received", "Needs reconciling"),
    ],
    mocked: "You type the result in; there is no lab interface.",
    production: "HL7 ORU from the lab lands as DiagnosticReport; the surgeon reconciles and signs.",
  },
  coding: {
    title: "Coding",
    purpose: "Coding queue: AI-suggested codes waiting for a coder, attested cases and charge exports.",
    steps: ["Open a case in review.", "Accept or edit each code; evidence links show the note text behind it.", "Attest, then export charges."],
    records: [caseLink("case_113", "coding", "Case 0897 · coding in review", "Suggested 45385 + Z12.11")],
    mocked: "Suggestions are built from the demo note; export makes a fake 837P.",
    production: "Coding agent via the AI gateway suggests; a coder always attests before the claim is sent.",
  },
  quality: {
    title: "Quality",
    purpose: "Colonoscopy quality measures: adenoma detection rate, cecal intubation, withdrawal time, prep, turnaround.",
    steps: ["Read the 30-day trends against the dashed target lines.", "Compare surgeons in the ADR bar list.", "Close a pathology case and come back — the numbers move."],
    records: [],
    mocked: "Metrics are calculated from the demo cases plus a synthetic history.",
    production: "Computed from signed notes and reconciled pathology in Medplum.",
  },
  audit: {
    title: "Audit log",
    purpose: "Who did what, when. Every sign-in, view and change is recorded.",
    steps: ["Filter by action or person.", "Click a row for details.", "Do something elsewhere (sign a note) and watch it appear here."],
    records: [],
    mocked: "Events are kept in memory and cleared on reload.",
    production: "FHIR AuditEvent written by Medplum and the API; kept per HIPAA retention.",
  },
  admin: {
    title: "Admin",
    purpose: "Center setup: staff roster, rooms, block templates and which AI model each agent uses.",
    steps: ["Browse the roster and rooms.", "Check block templates per room.", "See which model and prompt version each AI agent runs (read-only)."],
    records: [],
    mocked: "Read-only view of seeded settings.",
    production: "Settings live in Medplum and the agent registry; model changes go through config review.",
  },
  "my-care": {
    title: "My procedure",
    purpose: "The patient portal: procedure details, prep checklist, escort, instructions and results.",
    steps: ["Tick off prep items as you go.", "Confirm who is driving you home under Escort.", "After the procedure, read instructions and your result letter."],
    records: [
      { label: "Prep checklist", href: "/my-care?view=prep" },
      { label: "Results & instructions", href: "/my-care?view=results" },
    ],
    roles: ["PATIENT"],
    mocked: "Robert Miller (case 0915) is the demo patient.",
    production: "Patient-facing app with its own sign-in; reads only this patient's records.",
  },
  guide: {
    title: "Help center",
    purpose: "Everything in the demo, grouped by the patient journey, plus personas, shortcuts and answers.",
    steps: ["Start or restart the guided tour.", "Pick a feature and click Open (the persona switches for you).", "Reset demo data if you want a clean slate."],
    records: [],
    roles: [...STAFF, "PATIENT"],
    mocked: "This page only exists in the demo.",
    production: "Real training material would live in the staff handbook.",
  },
};

/* ─── Case workspace tabs ──────────────────────────────────────────────── */

export const CASE_TAB_HELP: Readonly<Record<string, TabHelp>> = {
  "pre-procedure": {
    title: "Pre-procedure",
    hint: "Review the AI pre-visit brief, confirm medication holds, then set ASA and Mallampati and sign the H&P.",
    purpose: "History & physical before the day: AI pre-visit brief, medications with hold rules, allergies, airway.",
    steps: ["Read the pre-visit brief and accept or edit it.", "Review each medication hold (e.g. apixaban) and mark holds reviewed.", "Set ASA and Mallampati, then Sign H&P."],
    records: [caseLink("case_107", "pre-procedure", "Case 0917 · H&P unsigned", "Apixaban hold pending, penicillin allergy")],
    roles: STAFF,
    mocked: "The brief is canned text built from the demo chart.",
    production: "Pre-visit agent drafts the brief from Medplum records; a clinician accepts and signs.",
  },
  "pre-op": {
    title: "Pre-op",
    hint: "Check in, record vitals, IV, NPO and escort, sign consents — the gate on the right turns green when all pass.",
    purpose: "Day-of readiness: check-in, vitals, IV, NPO, escort, consents with signature, readiness gate.",
    steps: ["Record vitals and confirm IV, NPO and escort.", "Open each consent and sign on the pad.", "When the gate on the right is all green, click Mark ready."],
    records: [
      caseLink("case_107", "pre-op", "Case 0917 · in pre-op", "Consents pending"),
      caseLink("case_108", "pre-op", "Case 0918 · arrived", "Start pre-op"),
    ],
    roles: STAFF,
    mocked: "Signatures are stored in memory as images.",
    production: "Consent + QuestionnaireResponse in Medplum; the API re-runs the readiness gate.",
  },
  procedure: {
    title: "Procedure",
    hint: "Room mode: big tap targets. Do the time-out, tap events as they happen, log specimen jars, then End procedure.",
    purpose: "Procedure room: team time-out, event taps with timer, live narration, specimen jars, images.",
    steps: [
      "Tick the time-out items and attest for each role, then Start procedure.",
      "Tap cecum reached, withdrawal start and scope out as they happen.",
      "Add a jar per polyp (site, size, method), then End procedure.",
    ],
    records: [
      caseLink("case_104", "procedure", "Case 0914 · ready, time-out not done", "Start here"),
      caseLink("case_103", "procedure", "Case 0913 · in procedure", "Jar A logged, no scope-out yet"),
    ],
    roles: STAFF,
    mocked: "Narration is a scripted transcript, not real speech-to-text.",
    production: "Room tablet streams audio to speech-to-text; events and specimens become FHIR resources.",
  },
  anesthesia: {
    title: "Anesthesia",
    hint: "Flowsheet: add vitals every 5 minutes, log drug doses (e.g. propofol), airway events and sedation start/end.",
    purpose: "Anesthesia record: vitals grid, drug administration with running totals, airway, sedation times.",
    steps: ["Set sedation start.", "Add a propofol dose and a set of vitals.", "Record airway support, then sedation end."],
    records: [caseLink("case_103", "anesthesia", "Case 0913 · in procedure", "Record doses live")],
    roles: STAFF,
    mocked: "Monitors are not connected; you type the values.",
    production: "Device integration feeds vitals; entries queue offline on the room tablet.",
  },
  note: {
    title: "Note",
    hint: "Generate the AI note, fix any blocking gap chips, review the exceptions first, then sign. AI never signs for you.",
    purpose: "AI procedure note: generate, watch it stream, review exceptions, fix gaps, sign.",
    steps: [
      "Click Generate and watch the sections stream in.",
      "Resolve each blocking gap chip (e.g. a missing polyp size).",
      "Review critic suggestions, then Sign — you confirm first.",
    ],
    records: [
      caseLink("case_106", "note", "Case 0916 · in recovery, no note", "Generating finds a missing jar size"),
      caseLink("case_101", "note", "Case 0911 · draft waiting", "Blocking gap: prep score"),
    ],
    roles: STAFF,
    mocked: "The stream is a scripted mock of the note agent (~6 s).",
    production: "Note agent runs as a worker job via the AI gateway; draft-first, the clinician signs.",
  },
  recovery: {
    title: "Recovery",
    hint: "Score Aldrete (≥ 9, no zeros), confirm the escort, approve the AI discharge instructions, then Discharge.",
    purpose: "PACU: vitals, Aldrete/PADSS scoring, discharge gate, AI discharge instructions, discharge.",
    steps: ["Score Aldrete — 9 or more with no zeros passes.", "Generate and approve discharge instructions.", "Confirm the escort is present, then Discharge."],
    records: [
      caseLink("case_106", "recovery", "Case 0916 · just arrived", "No Aldrete yet"),
      caseLink("case_102", "recovery", "Case 0912 · ready to go", "Aldrete 10, instructions drafted"),
    ],
    roles: STAFF,
    mocked: "Instructions are template text from the mock agent.",
    production: "Discharge agent drafts from the signed note; a nurse approves before the patient sees it.",
  },
  coding: {
    title: "Coding",
    hint: "Suggested codes are sorted lowest confidence first. Open evidence, accept or edit, attest, then export charges.",
    purpose: "CPT/ICD/modifier suggestions with evidence and confidence, coder attestation, charge export.",
    steps: ["Open each code's evidence and accept or edit it.", "Attest the coding.", "Export charges (you confirm first)."],
    records: [caseLink("case_113", "coding", "Case 0897 · coding in review", "45385 + Z12.11 suggested")],
    roles: STAFF,
    mocked: "Export produces a fake 837P line list.",
    production: "Coding agent suggests; coder attests; claim goes to the clearinghouse.",
  },
  pathology: {
    title: "Pathology",
    hint: "Record each jar's result, reconcile it to the polyp, set the surveillance interval, send the letter, close.",
    purpose: "Per-specimen results, adenoma flag, surveillance interval, result letters, case close.",
    steps: ["Record the result for each jar (e.g. tubular adenoma).", "Set the recommended surveillance interval.", "Send the result letter, then Close case."],
    records: [
      caseLink("case_115", "pathology", "Case 0871 · awaiting results", "Start here"),
      caseLink("case_113", "pathology", "Case 0897 · received", "Needs reconciling"),
    ],
    roles: STAFF,
    mocked: "You enter results by hand.",
    production: "Lab results arrive over HL7; the interval follows guideline rules in @asc/clinical-rules.",
  },
};

/* ─── Guided tour (demo script §6) ─────────────────────────────────────── */

const reached = (phase: CasePhase) => (detail: CaseDetail) => PHASE_ORDER.indexOf(detail.case.phase) >= PHASE_ORDER.indexOf(phase);

/** Default hint for steps that auto-complete from the case phase. */
export const TOUR_PHASE_HINT = "Ticks itself when the case moves on.";

export const TOUR_STEPS = [
  {
    id: "referral",
    role: "ADMIN",
    title: "Turn a fax into a patient",
    description: "Open a referral, check the AI-extracted facts against the fax, then create the patient.",
    href: "/referrals",
  },
  {
    id: "book",
    role: "ADMIN",
    title: "Book a case",
    description: "Click Book case, pick the patient, colonoscopy, screening, Room 2 at 09:30. Conflicts show before you save.",
    href: "/schedule",
  },
  {
    id: "confirm",
    role: "ADMIN",
    title: "Confirm a scheduled case",
    description: "Case 0919's insurance shows inactive. Re-check eligibility on the patient's chart, then Confirm case here.",
    href: "/cases/case_109?tab=pre-procedure",
    caseId: "case_109",
    check: reached("CONFIRMED"),
  },
  {
    id: "pre-op",
    role: "NURSE",
    title: "Get a patient ready",
    description: "Sign the H&P and review the apixaban hold, then on Pre-op sign consents and record vitals until the gate is green.",
    href: "/cases/case_107?tab=pre-procedure",
    caseId: "case_107",
    check: reached("READY_FOR_PROCEDURE"),
  },
  {
    id: "time-out",
    role: "NURSE",
    title: "Run the time-out",
    description: "Tick every time-out item, attest for surgeon, nurse and anesthesia, then Start procedure.",
    href: "/cases/case_104?tab=procedure",
    caseId: "case_104",
    check: reached("IN_PROCEDURE"),
  },
  {
    id: "anesthesia",
    role: "ANESTHESIOLOGIST",
    title: "Chart sedation",
    description: "On the flowsheet, add a propofol dose and a set of vitals for the case in the room.",
    href: "/cases/case_103?tab=anesthesia",
  },
  {
    id: "procedure",
    role: "NURSE",
    title: "Finish the procedure",
    description: "Tap scope out, log a second polyp jar, then End procedure. The case moves to recovery.",
    href: "/cases/case_103?tab=procedure",
    caseId: "case_103",
    check: reached("RECOVERY"),
  },
  {
    id: "note",
    role: "SURGEON",
    title: "Sign the AI note",
    description: "Click Generate, fix the blocking gap chip (a missing jar size), review, then sign. AI never signs for you.",
    href: "/cases/case_106?tab=note",
    caseId: "case_106",
    check: (detail: CaseDetail) => detail.summary.noteStatus === "signed",
    autoHint: "Ticks itself when the note is signed.",
  },
  {
    id: "discharge",
    role: "NURSE",
    title: "Discharge from recovery",
    description: "Aldrete is 10. Approve the AI discharge instructions, confirm the escort, then Discharge.",
    href: "/cases/case_102?tab=recovery",
    caseId: "case_102",
    check: reached("DISCHARGED"),
  },
  {
    id: "coding",
    role: "ADMIN",
    title: "Code and bill",
    description: "Accept the suggested 45385 and Z12.11 (check the evidence), attest, then export charges.",
    href: "/cases/case_113?tab=coding",
    caseId: "case_113",
    check: (detail: CaseDetail) => detail.summary.codingStatus === "exported",
    autoHint: "Ticks itself when charges are exported.",
  },
  {
    id: "pathology",
    role: "SURGEON",
    title: "Close the loop on pathology",
    description: "Record tubular adenoma for each jar, set surveillance to 5 years, send the letter, then Close case.",
    href: "/cases/case_115?tab=pathology",
    caseId: "case_115",
    check: reached("CLOSED"),
  },
  {
    id: "portal",
    role: "PATIENT",
    title: "See it as the patient",
    description: "The portal shows prep, escort, discharge instructions and the result letter in plain language.",
    href: "/my-care?view=results",
  },
] as const satisfies readonly {
  id: string;
  role: UserRole;
  title: string;
  description: string;
  href: string;
  caseId?: string;
  check?: (detail: CaseDetail) => boolean;
  autoHint?: string;
}[];

/* ─── Welcome, explainer, help center ──────────────────────────────────── */

export const WELCOME = {
  title: "Welcome to the ASC EHR demo",
  intro: "A clickable GI surgery center EHR. There is no backend: every patient and case is synthetic and lives in your browser.",
  highlights: [
    { id: "journey", title: "Follow one patient end to end", description: "Fax referral → booking → pre-op → procedure → AI note → discharge → coding → pathology.", icon: Stethoscope },
    { id: "roles", title: "Switch persona any time", description: "Front desk, nurse, surgeon, anesthesia and patient each see their own screens.", icon: HeartHandshake },
    { id: "ai", title: "Try the AI drafts", description: "Referral facts, the procedure note, codes and discharge instructions — always reviewed by a human.", icon: Bot },
  ],
  note: "Reloading the page signs you out and resets the data. Help is always under the ? button.",
} as const;

export const DEMO_EXPLAINER = [
  { id: "pick", title: "Pick a persona", body: "One click, no password. Start with Front desk to follow the full story." },
  { id: "tour", title: "Follow the tour", body: "A short checklist takes you through each step and switches persona for you." },
  { id: "data", title: "Synthetic data only", body: "Nothing is real or saved. A page reload signs you out and starts fresh." },
  { id: "help", title: "Stuck? Press ?", body: "Every screen has a help panel with what to try and which records to open." },
] as const;

/** Help center groups, in journey order. `key` = ROUTE_HELP / CASE_TAB_HELP key. */
export const GUIDE_SECTIONS = [
  {
    id: "before",
    title: "Before the day",
    icon: Inbox,
    items: [
      { key: "referrals", role: "ADMIN", href: "/referrals" },
      { key: "patients", role: "ADMIN", href: "/patients" },
      { key: "schedule", role: "ADMIN", href: "/schedule" },
    ],
  },
  {
    id: "day-of",
    title: "Day of procedure",
    icon: ClipboardCheck,
    items: [
      { key: "whiteboard", role: "NURSE", href: "/whiteboard" },
      { key: "pre-procedure", role: "NURSE", href: "/cases/case_107?tab=pre-procedure" },
      { key: "pre-op", role: "NURSE", href: "/cases/case_107?tab=pre-op" },
      { key: "procedure", role: "NURSE", href: "/cases/case_104?tab=procedure" },
      { key: "anesthesia", role: "ANESTHESIOLOGIST", href: "/cases/case_103?tab=anesthesia" },
      { key: "recovery", role: "NURSE", href: "/cases/case_102?tab=recovery" },
    ],
  },
  {
    id: "after",
    title: "After the procedure",
    icon: FileText,
    items: [
      { key: "note", role: "SURGEON", href: "/cases/case_106?tab=note" },
      { key: "coding", role: "ADMIN", href: "/coding" },
      { key: "pathology", role: "SURGEON", href: "/pathology" },
      { key: "my-care", role: "PATIENT", href: "/my-care" },
    ],
  },
  {
    id: "center",
    title: "Running the center",
    icon: LayoutDashboard,
    items: [
      { key: "dashboard", role: "ADMIN", href: "/dashboard" },
      { key: "worklist", role: "SURGEON", href: "/worklist" },
      { key: "quality", role: "ADMIN", href: "/quality" },
      { key: "audit", role: "ADMIN", href: "/audit" },
      { key: "admin", role: "ADMIN", href: "/admin" },
    ],
  },
] as const satisfies readonly { id: string; title: string; icon: LucideIcon; items: readonly { key: string; role: UserRole; href: string }[] }[];

/** Short persona names for badges. */
export const ROLE_BADGE: Readonly<Record<UserRole, string>> = {
  ADMIN: "Front desk",
  NURSE: "Nurse",
  SURGEON: "Surgeon",
  ANESTHESIOLOGIST: "Anesthesia",
  PATIENT: "Patient",
};

/** What each persona is for (names come from the demo presets). */
export const PERSONA_GUIDE: Readonly<Record<UserRole, { readonly lands: string; readonly tryThis: string }>> = {
  ADMIN: { lands: "Center operations", tryThis: "Referrals, booking, coding, audit" },
  NURSE: { lands: "Whiteboard", tryThis: "Check-in, pre-op, room, recovery" },
  SURGEON: { lands: "Slate + sign queue", tryThis: "AI note, pathology, quality" },
  ANESTHESIOLOGIST: { lands: "Anesthesia queue", tryThis: "Sedation flowsheet, airway" },
  PATIENT: { lands: "My procedure", tryThis: "Prep, escort, results" },
};

export const SHORTCUTS = [
  { id: "search", keys: ["⌘", "K"], label: "Search patients, cases and pages (Ctrl+K on Windows)" },
  { id: "help", keys: ["?"], label: "Help for this page" },
  { id: "sidebar", keys: ["⌘", "B"], label: "Show or hide the sidebar (Ctrl+B)" },
  { id: "close", keys: ["Esc"], label: "Close a dialog, sheet or the tour panel" },
] as const;

export const FAQ = [
  {
    id: "reload",
    q: "Why does reloading log me out?",
    a: "The session is kept in memory only, never in browser storage, so no token or patient data is left on the device. A reload also re-seeds the demo data.",
  },
  { id: "real", q: "Is any of this data real?", a: "No. Every patient, case and document is synthetic. Please don't type real patient details." },
  {
    id: "ai",
    q: "Does the AI sign or send anything by itself?",
    a: "Never. AI drafts are marked as drafts. Signing a note, attesting codes, exporting charges and discharging always need a person to click and confirm.",
  },
  { id: "switch", q: "How do I see another role?", a: "Use the persona switcher in the top bar. It signs you in as that role without reloading, so the data stays." },
  { id: "broken", q: "I got a case into a strange state.", a: "Use Reset demo data (user menu or this page) to put every record back to its starting point." },
  { id: "tour-progress", q: "What does the tour remember?", a: "Only which steps you ticked and whether you've seen the welcome — never patient data." },
] as const;
