import { isPhaseAtLeast, PHASE_ORDER, STOPPED_PHASES } from "@asc/clinical-rules";
import type {
  AldreteScore,
  AnesthesiaRecord,
  AuditEvent,
  CaseCoding,
  CasePhase,
  Consent,
  DischargeInstructions,
  DrugDose,
  HpAssessment,
  ImageCapture,
  NarrationSegment,
  NoteDraft,
  PathologyResult,
  Patient,
  PrepItem,
  ProcedureCase,
  ProcedureCode,
  ProcedureEvent,
  ProcedureEventType,
  ProcedureIntent,
  QualityPoint,
  Referral,
  ResultLetter,
  Specimen,
  StaffMember,
  SurveillancePlan,
  TimeOutRecord,
  VitalsEntry,
  WorkItem,
} from "@asc/types";
import { surveillanceInterval, toIsoDate } from "@asc/clinical-rules";
import { buildCodingSuggestions, chargeLinesFrom } from "./coding-builder";
import { buildDischargeInstructions, buildPreVisitBrief } from "./content";
import { buildNote, noteProvenance } from "./note-builder";
import { seedPatients } from "./seed-patients";
import { seedReferrals } from "./seed-referrals";
import { STAFF } from "./staff";
import { addMinutes, demoAnchor, isoAt, patientRef, seededRandom, staffRef } from "./util";

// ─── State shape ────────────────────────────────────────────────────────────

interface DemoState {
  readonly anchor: number;
  readonly patients: Map<string, Patient>;
  readonly cases: Map<string, ProcedureCase>;
  readonly hp: Map<string, HpAssessment>;
  readonly consents: Map<string, readonly Consent[]>;
  readonly vitals: Map<string, readonly VitalsEntry[]>;
  readonly timeOut: Map<string, TimeOutRecord>;
  readonly events: Map<string, readonly ProcedureEvent[]>;
  readonly narration: Map<string, readonly NarrationSegment[]>;
  readonly specimens: Map<string, readonly Specimen[]>;
  readonly images: Map<string, readonly ImageCapture[]>;
  readonly anesthesia: Map<string, AnesthesiaRecord>;
  readonly aldrete: Map<string, AldreteScore>;
  readonly discharge: Map<string, DischargeInstructions>;
  readonly notes: Map<string, NoteDraft>;
  readonly coding: Map<string, CaseCoding>;
  readonly pathology: Map<string, readonly PathologyResult[]>;
  readonly surveillance: Map<string, SurveillancePlan>;
  readonly letters: Map<string, readonly ResultLetter[]>;
  readonly referrals: Map<string, Referral>;
  /** Portal prep checklist per patient (created lazily). */
  readonly prep: Map<string, readonly PrepItem[]>;
  workItems: WorkItem[];
  audit: AuditEvent[];
  readonly quality: readonly QualityPoint[];
}

// ─── Case specs: one demo case in every phase ───────────────────────────────

type Team = readonly [surgeon: StaffMember, anesthesia: StaffMember, nurse: StaffMember];
type PathState = "awaiting" | "received" | "reconciled" | "closed";

interface CaseSpec {
  readonly id: string;
  readonly number: string;
  readonly patientId: string;
  readonly procedure: ProcedureCode;
  readonly intent: ProcedureIntent;
  readonly indication: string;
  readonly roomId: string;
  /** Minutes from the demo anchor (now, floored to 15 min). */
  readonly offsetMin: number;
  readonly durationMin: number;
  readonly team: Team;
  readonly phase: CasePhase;
  readonly polyps?: 0 | 1 | 2;
  readonly note?: "draft_blocking" | "draft_clean";
  readonly missingSize?: boolean;
  readonly noBbps?: boolean;
  readonly path?: PathState;
  readonly eligibility?: "inactive" | "pending";
  readonly cancelReason?: string;
}

const DAY = 24 * 60;
const T_VANCE: Team = [STAFF.vance, STAFF.rostova, STAFF.jenkins];
const T_VANCE_TRAN: Team = [STAFF.vance, STAFF.rostova, STAFF.tran];
const T_NAIR: Team = [STAFF.nair, STAFF.whitfield, STAFF.delgado];
const T_OKAFOR: Team = [STAFF.okafor, STAFF.whitfield, STAFF.tran];

const SCREENING = "Average-risk colorectal cancer screening";

export const CASE_SPECS: readonly CaseSpec[] = [
  { id: "case_101", number: "0911", patientId: "pat_101", procedure: "COLONOSCOPY", intent: "screening", indication: SCREENING, roomId: "room-1", offsetMin: -180, durationMin: 30, team: T_VANCE, phase: "DISCHARGED", polyps: 2, note: "draft_blocking", noBbps: true },
  { id: "case_102", number: "0912", patientId: "pat_102", procedure: "COLONOSCOPY", intent: "surveillance", indication: "Personal history of tubular adenoma (2021)", roomId: "room-1", offsetMin: -120, durationMin: 30, team: T_VANCE_TRAN, phase: "READY_FOR_DISCHARGE", polyps: 1, note: "draft_clean" },
  { id: "case_103", number: "0913", patientId: "pat_103", procedure: "COLONOSCOPY", intent: "screening", indication: SCREENING, roomId: "room-1", offsetMin: -15, durationMin: 30, team: T_VANCE_TRAN, phase: "IN_PROCEDURE", polyps: 1 },
  { id: "case_104", number: "0914", patientId: "pat_104", procedure: "COLONOSCOPY", intent: "diagnostic", indication: "Iron-deficiency anemia", roomId: "room-1", offsetMin: 30, durationMin: 30, team: T_VANCE, phase: "READY_FOR_PROCEDURE" },
  { id: "case_105", number: "0915", patientId: "pat_105", procedure: "COLONOSCOPY", intent: "screening", indication: SCREENING, roomId: "room-1", offsetMin: 90, durationMin: 30, team: T_VANCE, phase: "CONFIRMED" },
  { id: "case_106", number: "0916", patientId: "pat_106", procedure: "COLONOSCOPY", intent: "surveillance", indication: "Family history of colon cancer (first-degree relative at 52)", roomId: "room-2", offsetMin: -60, durationMin: 30, team: T_NAIR, phase: "RECOVERY", polyps: 2, missingSize: true },
  { id: "case_107", number: "0917", patientId: "pat_107", procedure: "COLONOSCOPY", intent: "diagnostic", indication: "Change in bowel habits and positive FIT", roomId: "room-2", offsetMin: 15, durationMin: 45, team: T_NAIR, phase: "PRE_OP" },
  { id: "case_108", number: "0918", patientId: "pat_108", procedure: "COLONOSCOPY", intent: "screening", indication: SCREENING, roomId: "room-2", offsetMin: 60, durationMin: 30, team: T_NAIR, phase: "ARRIVED" },
  { id: "case_109", number: "0919", patientId: "pat_109", procedure: "COLONOSCOPY", intent: "screening", indication: "Average-risk screening, age 45+", roomId: "room-2", offsetMin: 150, durationMin: 30, team: T_NAIR, phase: "SCHEDULED", eligibility: "inactive" },
  { id: "case_110", number: "0920", patientId: "pat_110", procedure: "COLONOSCOPY", intent: "diagnostic", indication: "Iron-deficiency anemia", roomId: "room-3", offsetMin: -90, durationMin: 30, team: T_OKAFOR, phase: "CANCELLED", cancelReason: "Inadequate bowel prep reported on arrival call" },
  { id: "case_111", number: "0921", patientId: "pat_111", procedure: "COLONOSCOPY", intent: "screening", indication: SCREENING, roomId: "room-3", offsetMin: -30, durationMin: 30, team: T_OKAFOR, phase: "NO_SHOW" },
  { id: "case_112", number: "0922", patientId: "pat_112", procedure: "EGD", intent: "diagnostic", indication: "Epigastric pain and reflux refractory to PPI", roomId: "room-3", offsetMin: 45, durationMin: 20, team: T_OKAFOR, phase: "CONFIRMED" },
  { id: "case_113", number: "0897", patientId: "pat_113", procedure: "COLONOSCOPY", intent: "surveillance", indication: "Personal history of adenomatous polyps", roomId: "room-1", offsetMin: -DAY - 120, durationMin: 30, team: T_VANCE, phase: "CHART_COMPLETE", polyps: 2, path: "received" },
  { id: "case_114", number: "0884", patientId: "pat_114", procedure: "COLONOSCOPY", intent: "screening", indication: SCREENING, roomId: "room-2", offsetMin: -2 * DAY - 60, durationMin: 30, team: T_NAIR, phase: "CODED", polyps: 1, path: "reconciled" },
  { id: "case_115", number: "0871", patientId: "pat_115", procedure: "COLONOSCOPY", intent: "screening", indication: SCREENING, roomId: "room-1", offsetMin: -3 * DAY - 120, durationMin: 30, team: T_VANCE, phase: "EXPORTED", polyps: 2, path: "awaiting" },
  { id: "case_116", number: "0842", patientId: "pat_116", procedure: "COLONOSCOPY", intent: "surveillance", indication: "Personal history of sessile serrated lesion", roomId: "room-3", offsetMin: -7 * DAY - 60, durationMin: 30, team: T_OKAFOR, phase: "CLOSED", polyps: 2, path: "closed" },
  { id: "case_117", number: "0931", patientId: "pat_110", procedure: "COLONOSCOPY", intent: "diagnostic", indication: "Iron-deficiency anemia (rebooked after inadequate prep)", roomId: "room-3", offsetMin: DAY + 60, durationMin: 30, team: T_OKAFOR, phase: "SCHEDULED", eligibility: "pending" },
];

export const PROCEDURE_LABEL: Readonly<Record<ProcedureCode, string>> = {
  COLONOSCOPY: "Colonoscopy",
  EGD: "EGD",
  EGD_COLONOSCOPY: "EGD + colonoscopy",
  FLEX_SIG: "Flexible sigmoidoscopy",
};

/** When a case entered each phase, in minutes relative to its scheduled start. */
const PHASE_OFFSET_MIN: Readonly<Record<CasePhase, number>> = {
  SCHEDULED: -7 * DAY,
  CONFIRMED: -2 * DAY,
  ARRIVED: -60,
  PRE_OP: -45,
  READY_FOR_PROCEDURE: -10,
  IN_PROCEDURE: 0,
  RECOVERY: 24,
  READY_FOR_DISCHARGE: 55,
  DISCHARGED: 75,
  CHART_COMPLETE: 240,
  CODED: DAY,
  EXPORTED: DAY + 120,
  CLOSED: 5 * DAY,
  CANCELLED: -120,
  NO_SHOW: 30,
};

/** Room timeline of a colonoscopy, minutes from start. */
const EVENT_TIMELINE: readonly (readonly [ProcedureEventType, number])[] = [
  ["SEDATION_START", 1],
  ["SCOPE_IN", 3],
  ["CECUM_REACHED", 9],
  ["WITHDRAWAL_START", 10],
  ["POLYP_FOUND", 13],
  ["SCOPE_OUT", 21],
  ["SEDATION_END", 23],
];

const POLYP_TEMPLATES: readonly Pick<Specimen, "site" | "description" | "sizeMm" | "removalMethod">[] = [
  { site: "ascending", description: "Sessile polyp", sizeMm: 6, removalMethod: "cold_snare" },
  { site: "sigmoid", description: "Flat polyp", sizeMm: 4, removalMethod: "cold_snare" },
];

const PATH_TEMPLATES: readonly Pick<PathologyResult, "histology" | "dysplasia" | "isAdenoma" | "diagnosis">[] = [
  { histology: "tubular_adenoma", dysplasia: "low_grade", isAdenoma: true, diagnosis: "Tubular adenoma, low-grade dysplasia; margins free" },
  { histology: "sessile_serrated_lesion", dysplasia: "none", isAdenoma: false, diagnosis: "Sessile serrated lesion without dysplasia" },
];

const NARRATION: readonly (readonly [number, string])[] = [
  [3, "Scope in, starting insertion."],
  [9, "Cecum reached — appendiceal orifice and ileocecal valve seen, photo taken."],
  [10, "Starting withdrawal. Prep looks good on the right."],
  [13, "Six millimeter sessile polyp, ascending colon. Cold snare, jar A."],
  [18, "Four millimeter flat polyp, sigmoid. Cold snare, jar B."],
  [21, "Retroflexion done, small internal hemorrhoids. Scope out."],
];

function actorFor(phase: CasePhase, team: Team) {
  const [surgeon, , nurse] = team;
  const byPhase: Partial<Record<CasePhase, StaffMember>> = {
    SCHEDULED: STAFF.chen,
    CONFIRMED: STAFF.chen,
    IN_PROCEDURE: surgeon,
    CHART_COMPLETE: surgeon,
    CODED: STAFF.price,
    EXPORTED: STAFF.price,
    CLOSED: surgeon,
    CANCELLED: STAFF.chen,
    NO_SHOW: STAFF.chen,
  };
  return byPhase[phase] ?? nurse;
}

// ─── Builders ───────────────────────────────────────────────────────────────

function vitalsRow(caseId: string, context: VitalsEntry["context"], at: string, by: StaffMember, index: number): VitalsEntry {
  const wobble = (index * 7) % 5;
  return {
    id: `vit_${caseId}_${context}_${index}`,
    caseId,
    context,
    recordedAt: at,
    hr: 68 + wobble,
    sbp: context === "intra" ? 112 + wobble : 128 + wobble,
    dbp: context === "intra" ? 68 + (wobble % 3) : 78 + (wobble % 3),
    spo2: context === "intra" ? 97 + (index % 2) : 98,
    rr: 14 + (index % 3),
    ...(context === "pre_op" ? { tempC: 36.7 } : {}),
    ...(context === "intra" ? { etco2: 36 + (index % 3) } : {}),
    ...(context === "pacu" ? { pain: index === 0 ? 2 : 1 } : {}),
    recordedBy: staffRef(by),
  };
}

function everyFiveMinutes(from: string, to: number): string[] {
  const out: string[] = [];
  for (let at = Date.parse(from); at <= to; at += 5 * 60_000) out.push(new Date(at).toISOString());
  return out;
}

export function createSeedState(now: Date = new Date()): DemoState {
  const anchor = demoAnchor(now);
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const clamp = (iso: string) => (Date.parse(iso) > nowMs - 60_000 ? new Date(nowMs - 60_000).toISOString() : iso);
  const createdAt = isoAt(anchor, -90 * DAY);

  const patients = new Map(seedPatients(createdAt).map((patient) => [patient.id, patient]));
  const state: DemoState = {
    anchor,
    patients,
    cases: new Map(),
    hp: new Map(),
    consents: new Map(),
    vitals: new Map(),
    timeOut: new Map(),
    events: new Map(),
    narration: new Map(),
    specimens: new Map(),
    images: new Map(),
    anesthesia: new Map(),
    aldrete: new Map(),
    discharge: new Map(),
    notes: new Map(),
    coding: new Map(),
    pathology: new Map(),
    surveillance: new Map(),
    letters: new Map(),
    referrals: new Map(seedReferrals(anchor).map((referral) => [referral.id, referral])),
    prep: new Map(),
    workItems: [],
    audit: [],
    quality: seedQuality(anchor),
  };

  for (const spec of CASE_SPECS) seedCase(state, spec, nowMs, nowIso, clamp);
  state.workItems = seedWorkItems(state, anchor);
  state.audit = seedAudit(state);
  return state;
}

function seedCase(state: DemoState, spec: CaseSpec, nowMs: number, nowIso: string, clamp: (iso: string) => string): void {
  const start = isoAt(state.anchor, spec.offsetMin);
  const effective: CasePhase = STOPPED_PHASES.includes(spec.phase) ? "CONFIRMED" : spec.phase;
  const reached = (phase: CasePhase) => isPhaseAtLeast(effective, phase);
  const past = (iso: string) => Date.parse(iso) <= nowMs;
  const [surgeon, anesthesiaProvider, nurse] = spec.team;
  const isColon = spec.procedure !== "EGD";
  const inRoomNow = spec.phase === "IN_PROCEDURE";

  // Patient-level state implied by the phase.
  const basePatient = state.patients.get(spec.patientId);
  if (!basePatient) return;
  const eligibilityStatus = spec.eligibility ?? (reached("CONFIRMED") ? "active" : "pending");
  const patient: Patient = {
    ...basePatient,
    coverage: basePatient.coverage && {
      ...basePatient.coverage,
      eligibility: {
        status: eligibilityStatus,
        checkedAt: clamp(addMinutes(start, PHASE_OFFSET_MIN.CONFIRMED - 60)),
        transactionId: `X12-271-${spec.number}`,
        ...(eligibilityStatus === "active" ? { copayCents: 0, deductibleRemainingCents: 45_000 } : {}),
        ...(eligibilityStatus === "inactive" ? { message: "Coverage terminated at plan year end — verify new plan." } : {}),
        ...(eligibilityStatus === "pending" ? { message: "Awaiting 271 response." } : {}),
      },
    },
    escort: basePatient.escort && {
      ...basePatient.escort,
      confirmed: reached("CONFIRMED"),
      present: reached("ARRIVED"),
    },
    medications: basePatient.medications.map((med) =>
      med.holdRule ? { ...med, holdStatus: reached("READY_FOR_PROCEDURE") ? "confirmed" : "pending" } : med,
    ),
  };
  state.patients.set(patient.id, patient);

  const timestamps: Partial<Record<CasePhase, string>> = Object.fromEntries(
    [...PHASE_ORDER.filter(reached), ...(effective === spec.phase ? [] : [spec.phase])].map((phase) => [
      phase,
      clamp(addMinutes(start, PHASE_OFFSET_MIN[phase])),
    ]),
  );

  // Room events (only those already in the past while the case is in the room).
  const events: ProcedureEvent[] = reached("IN_PROCEDURE")
    ? EVENT_TIMELINE.filter(([type]) => isColon || !["CECUM_REACHED", "WITHDRAWAL_START", "POLYP_FOUND"].includes(type))
        .filter(([type]) => (spec.polyps ?? 0) > 0 || type !== "POLYP_FOUND")
        .map(([type, minute]) => ({
          id: `evt_${spec.id}_${type.toLowerCase()}`,
          caseId: spec.id,
          type,
          at: addMinutes(start, minute),
          by: staffRef(type.startsWith("SEDATION") ? anesthesiaProvider : nurse),
        }))
        .filter((event) => !inRoomNow || (past(event.at) && event.type !== "SCOPE_OUT" && event.type !== "SEDATION_END"))
    : [];

  const specimens: Specimen[] = POLYP_TEMPLATES.slice(0, spec.polyps ?? 0)
    .map((template, index): Specimen => ({
      id: `spc_${spec.id}_${index === 0 ? "a" : "b"}`,
      caseId: spec.id,
      jar: index === 0 ? "A" : "B",
      site: template.site,
      description: template.description,
      sizeMm: spec.missingSize && index === 1 ? undefined : template.sizeMm,
      removalMethod: template.removalMethod,
      collectedAt: addMinutes(start, index === 0 ? 13 : 18),
      pathologyStatus: "pending",
    }))
    .filter((specimen) => !inRoomNow || past(specimen.collectedAt));

  const procedureCase: ProcedureCase = {
    id: spec.id,
    caseNumber: `C-${new Date(start).getFullYear() % 100}-${spec.number}`,
    patientId: patient.id,
    patient: patientRef(patient),
    procedure: spec.procedure,
    procedureLabel: PROCEDURE_LABEL[spec.procedure],
    intent: spec.intent,
    indication: spec.indication,
    roomId: spec.roomId,
    scheduledStart: start,
    durationMin: spec.durationMin,
    team: { surgeon: staffRef(surgeon), anesthesia: staffRef(anesthesiaProvider), nurse: staffRef(nurse) },
    phase: spec.phase,
    timestamps,
    readiness: {
      prepConfirmed: reached("CONFIRMED"),
      eligibilityActive: eligibilityStatus === "active",
      hpCurrent: reached("READY_FOR_PROCEDURE"),
      asaSet: reached("PRE_OP"),
      consentsSigned: reached("READY_FOR_PROCEDURE"),
      holdsConfirmed: reached("READY_FOR_PROCEDURE"),
      escortConfirmed: reached("CONFIRMED"),
      npoConfirmed: reached("ARRIVED"),
      ivPlaced: reached("READY_FOR_PROCEDURE"),
      timeOutComplete: reached("IN_PROCEDURE"),
    },
    ...(reached("PRE_OP") ? { asa: spec.id === "case_107" ? 3 : 2 } : {}),
    ...(reached("ARRIVED") ? { npoSince: addMinutes(start, -10 * 60) } : {}),
    ...(isColon && reached("RECOVERY") && !spec.noBbps ? { bbps: { right: 2, transverse: 3, left: 3 } } : {}),
    ...(spec.cancelReason ? { cancelReason: spec.cancelReason } : {}),
  };
  state.cases.set(spec.id, procedureCase);

  if (reached("CONFIRMED")) {
    const signed = reached("READY_FOR_PROCEDURE");
    state.hp.set(spec.id, {
      caseId: spec.id,
      status: signed ? "signed" : "draft",
      asa: reached("PRE_OP") ? (procedureCase.asa ?? 2) : null,
      mallampati: reached("PRE_OP") ? 2 : null,
      airwayNotes: reached("PRE_OP") ? "Full dentition, normal mouth opening and neck extension." : "",
      heart: reached("PRE_OP") ? "Regular rate and rhythm, no murmur." : "",
      lungs: reached("PRE_OP") ? "Clear to auscultation bilaterally." : "",
      intervalHistory: reached("PRE_OP") ? "No changes since pre-procedure call. Prep completed with clear returns." : "",
      holdsReviewed: signed,
      brief: buildPreVisitBrief(procedureCase, patient, clamp(addMinutes(start, -DAY))),
      ...(reached("PRE_OP") ? { performedBy: staffRef(surgeon), performedAt: timestamps.PRE_OP } : {}),
      ...(signed ? { signedAt: timestamps.READY_FOR_PROCEDURE } : {}),
    });
    const consentSigned = reached("READY_FOR_PROCEDURE");
    const consentBase = (kind: Consent["kind"], title: string, summary: string): Consent => ({
      id: `cns_${spec.id}_${kind}`,
      caseId: spec.id,
      kind,
      title,
      summary,
      status: consentSigned ? "signed" : "pending",
      ...(consentSigned
        ? { signerName: procedureCase.patient.displayName, witness: staffRef(nurse), signedAt: timestamps.PRE_OP }
        : {}),
    });
    state.consents.set(spec.id, [
      consentBase("procedure", `${procedureCase.procedureLabel} consent`, "Bleeding, perforation, infection, missed lesions; alternatives discussed."),
      consentBase("sedation", "Anesthesia / sedation consent", "Monitored anesthesia care with propofol; airway risks discussed."),
    ]);
  }

  state.vitals.set(spec.id, [
    ...(reached("PRE_OP") ? [vitalsRow(spec.id, "pre_op", timestamps.PRE_OP ?? start, nurse, 0)] : []),
    ...(reached("RECOVERY")
      ? everyFiveMinutes(timestamps.RECOVERY ?? start, Math.min(Date.parse(timestamps.RECOVERY ?? start) + 30 * 60_000, nowMs))
          .filter((_, index) => index % 3 === 0)
          .map((at, index) => vitalsRow(spec.id, "pacu", at, nurse, index))
      : []),
  ]);

  const attested = reached("IN_PROCEDURE");
  state.timeOut.set(spec.id, {
    caseId: spec.id,
    checklist: {
      patientIdentity: attested,
      procedureConfirmed: attested,
      consentVerified: attested,
      allergiesReviewed: attested,
      equipmentReady: attested,
      anticoagulationReviewed: attested,
    },
    attestations: attested
      ? [
          { role: "SURGEON", by: staffRef(surgeon), at: addMinutes(start, -1) },
          { role: "NURSE", by: staffRef(nurse), at: addMinutes(start, -1) },
          { role: "ANESTHESIOLOGIST", by: staffRef(anesthesiaProvider), at: addMinutes(start, -1) },
        ]
      : [],
    ...(attested ? { completedAt: addMinutes(start, -1) } : {}),
  });

  state.events.set(spec.id, events);
  state.specimens.set(spec.id, specimens);
  state.narration.set(
    spec.id,
    reached("IN_PROCEDURE") && isColon
      ? NARRATION.filter(([minute]) => (spec.polyps ?? 0) >= 2 || minute !== 18)
          .filter(([minute]) => (spec.polyps ?? 0) >= 1 || minute !== 13)
          .map(([minute, text], index) => ({
            id: `nar_${spec.id}_${index}`,
            caseId: spec.id,
            at: addMinutes(start, minute),
            speaker: surgeon.name,
            text,
          }))
          .filter((segment) => !inRoomNow || past(segment.at))
      : [],
  );
  state.images.set(
    spec.id,
    reached("RECOVERY")
      ? [
          { id: `img_${spec.id}_cecum`, caseId: spec.id, at: addMinutes(start, 9), site: isColon ? "cecum" : "duodenum", caption: isColon ? "Appendiceal orifice" : "Second portion of duodenum" },
          ...specimens.map((specimen) => ({
            id: `img_${specimen.id}`,
            caseId: spec.id,
            at: specimen.collectedAt,
            site: specimen.site,
            caption: `Polyp before resection (jar ${specimen.jar})`,
            specimenId: specimen.id,
          })),
        ]
      : [],
  );

  const sedationStart = events.find((event) => event.type === "SEDATION_START")?.at;
  const sedationEnd = events.find((event) => event.type === "SEDATION_END")?.at;
  const doseTimes = reached("IN_PROCEDURE") ? [1, 1, 5, 9, 13, 17].map((minute) => addMinutes(start, minute)).filter((at) => !inRoomNow || past(at)) : [];
  const doses: DrugDose[] = doseTimes.map((at, index) => ({
    id: `dose_${spec.id}_${index}`,
    drug: index === 0 ? "lidocaine" : "propofol",
    amount: index === 0 ? 40 : index === 1 ? 80 : 30,
    unit: "mg",
    route: "IV",
    at,
    by: staffRef(anesthesiaProvider),
  }));
  state.anesthesia.set(spec.id, {
    caseId: spec.id,
    provider: staffRef(anesthesiaProvider),
    technique: "MAC",
    airway: { device: "nasal_cannula", o2Lpm: 2 },
    airwayEvents: reached("IN_PROCEDURE") && !inRoomNow ? [{ id: `air_${spec.id}_0`, type: "jaw_thrust", at: addMinutes(start, 6), note: "Brief, SpO2 stayed ≥ 95%." }] : [],
    ...(sedationStart ? { sedationStart } : {}),
    ...(sedationEnd ? { sedationEnd } : {}),
    doses,
    vitals: reached("IN_PROCEDURE")
      ? everyFiveMinutes(start, Math.min(Date.parse(start) + spec.durationMin * 60_000 - 5 * 60_000, nowMs)).map((at, index) =>
          vitalsRow(spec.id, "intra", at, anesthesiaProvider, index),
        )
      : [],
  });

  if (reached("READY_FOR_DISCHARGE")) {
    state.aldrete.set(spec.id, {
      caseId: spec.id,
      activity: 2,
      respiration: 2,
      circulation: 2,
      consciousness: 2,
      oxygenSaturation: 2,
      total: 10,
      recordedAt: timestamps.READY_FOR_DISCHARGE ?? nowIso,
      recordedBy: staffRef(nurse),
    });
    const instructions = buildDischargeInstructions(procedureCase, patient, specimens, timestamps.READY_FOR_DISCHARGE ?? nowIso);
    state.discharge.set(
      spec.id,
      reached("DISCHARGED")
        ? { ...instructions, status: "approved", approvedBy: staffRef(nurse), approvedAt: timestamps.DISCHARGED }
        : instructions,
    );
  }

  // AI note: signed from chart-complete on; drafts for the sign-queue demos.
  const signedNote = reached("CHART_COMPLETE");
  if (signedNote || spec.note) {
    const generatedAt = addMinutes(start, PHASE_OFFSET_MIN.RECOVERY + 10);
    const built = buildNote({ procedureCase, patient, events, specimens, anesthesia: state.anesthesia.get(spec.id) ?? emptyAnesthesia(spec.id, anesthesiaProvider) });
    const gapChips = built.gapChips
      .filter((chip) => spec.note !== "draft_clean" || !chip.blocking)
      .map((chip) => (signedNote ? { ...chip, resolved: true, resolution: "Documented by physician." } : chip));
    state.notes.set(spec.id, {
      id: `note_${spec.id}`,
      caseId: spec.id,
      status: signedNote ? "signed" : "draft",
      sections: built.sections,
      findings: built.findings,
      provenance: noteProvenance(generatedAt),
      gapChips,
      criticSuggestions: built.criticSuggestions.map((suggestion) => (signedNote ? { ...suggestion, status: "accepted" } : suggestion)),
      version: signedNote ? 2 : 1,
      ...(signedNote ? { signedBy: staffRef(surgeon), signedAt: timestamps.CHART_COMPLETE } : {}),
    });

    const suggestions = buildCodingSuggestions(procedureCase, patient, specimens).map((suggestion) =>
      reached("CODED") ? { ...suggestion, status: suggestion.code === "K64.8" ? ("rejected" as const) : ("accepted" as const) } : suggestion,
    );
    const exported = reached("EXPORTED");
    const lines = chargeLinesFrom(suggestions);
    state.coding.set(spec.id, {
      caseId: spec.id,
      status: exported ? "exported" : reached("CODED") ? "attested" : signedNote ? "in_review" : "not_ready",
      suggestions,
      provenance: { agent: "coding", model: "Tier: deep (BAA-hosted)", promptVersion: "coding@1.6.0", generatedAt },
      ...(reached("CODED") ? { attestedBy: staffRef(STAFF.price), attestedAt: timestamps.CODED } : {}),
      ...(exported
        ? {
            export: {
              id: `chg_${spec.id}`,
              caseId: spec.id,
              format: "837P",
              lines,
              totalCents: lines.reduce((sum, line) => sum + line.chargeCents, 0),
              createdAt: timestamps.EXPORTED ?? nowIso,
              status: "accepted",
              batchId: `BATCH-${spec.number}`,
            },
          }
        : {}),
    });
  }

  if (spec.path && spec.path !== "awaiting") {
    const reconciled = spec.path === "reconciled" || spec.path === "closed";
    const results: PathologyResult[] = specimens.map((specimen, index) => {
      const template = PATH_TEMPLATES[index] ?? PATH_TEMPLATES[0];
      return {
        id: `pth_${specimen.id}`,
        caseId: spec.id,
        specimenId: specimen.id,
        status: reconciled ? "reconciled" : "received",
        receivedAt: addMinutes(start, 3 * DAY),
        histology: template?.histology ?? "normal_mucosa",
        dysplasia: template?.dysplasia ?? "none",
        isAdenoma: template?.isAdenoma ?? false,
        sizeMm: specimen.sizeMm,
        diagnosis: template?.diagnosis ?? "",
        reportText: `Specimen ${specimen.jar} (${specimen.site.replace("_", " ")} polyp, ${specimen.removalMethod.replace("_", " ")}): ${template?.diagnosis ?? ""}.`,
        ...(reconciled ? { reconciledFindingId: `fnd_${specimen.id}` } : {}),
      };
    });
    state.pathology.set(spec.id, results);
    state.specimens.set(
      spec.id,
      specimens.map((specimen) => ({ ...specimen, pathologyStatus: reconciled ? "reconciled" : "resulted" })),
    );
    if (spec.path === "closed") {
      const recommendation = surveillanceInterval(results);
      const setAt = addMinutes(start, 4 * DAY);
      const due = new Date(start);
      due.setFullYear(due.getFullYear() + recommendation.intervalYears);
      state.surveillance.set(spec.id, { ...recommendation, dueDate: toIsoDate(due), setBy: staffRef(surgeon), setAt });
      state.letters.set(spec.id, [
        { id: `ltr_${spec.id}_p`, caseId: spec.id, recipient: "patient", channel: "portal", sentAt: setAt, summary: `Polyps were benign. Next colonoscopy in ${recommendation.intervalYears} years.` },
        { id: `ltr_${spec.id}_r`, caseId: spec.id, recipient: "referring_provider", channel: "fax", sentAt: setAt, summary: `Pathology and ${recommendation.intervalYears}-year surveillance recommendation.` },
      ]);
    }
  }
}

function emptyAnesthesia(caseId: string, provider: StaffMember): AnesthesiaRecord {
  return { caseId, provider: staffRef(provider), technique: "MAC", airway: { device: "nasal_cannula", o2Lpm: 2 }, airwayEvents: [], doses: [], vitals: [] };
}

// ─── Work items, audit, quality ─────────────────────────────────────────────

function seedWorkItems(state: DemoState, anchor: number): WorkItem[] {
  const caseNo = (id: string) => state.cases.get(id)?.caseNumber ?? id;
  const item = (
    id: string,
    type: WorkItem["type"],
    ownerRole: WorkItem["ownerRole"],
    title: string,
    detail: string,
    dueOffsetMin: number,
    links: Pick<WorkItem, "caseId" | "patientId" | "referralId">,
    priority: WorkItem["priority"] = "normal",
  ): WorkItem => ({
    id,
    type,
    title,
    detail,
    ownerRole,
    priority,
    status: "open",
    dueAt: isoAt(anchor, dueOffsetMin),
    createdAt: isoAt(anchor, dueOffsetMin - 240),
    ...links,
  });
  return [
    item("wi_sign_101", "sign_note", "SURGEON", `Sign procedure note ${caseNo("case_101")}`, "Draft ready — 1 blocking gap (bowel prep).", 60, { caseId: "case_101" }, "high"),
    item("wi_sign_102", "sign_note", "SURGEON", `Sign procedure note ${caseNo("case_102")}`, "Draft ready — no blocking gaps.", 90, { caseId: "case_102" }),
    item("wi_elig_109", "eligibility_failed", "ADMIN", `Eligibility inactive — ${caseNo("case_109")}`, "271: coverage terminated. Verify new plan before confirming.", 120, { caseId: "case_109", patientId: "pat_109" }, "high"),
    ...[...state.referrals.values()].map((referral) =>
      item(`wi_ref_${referral.id}`, "referral_intake", "ADMIN", `New referral — ${referral.fromPractice}`, `${referral.pageCount}-page fax, ${referral.priority}.`, referral.priority === "urgent" ? 60 : 24 * 60, { referralId: referral.id }, referral.priority === "urgent" ? "high" : "normal"),
    ),
    item("wi_path_115", "pending_pathology", "ADMIN", `Pathology pending — ${caseNo("case_115")}`, "2 specimens sent 3 days ago.", 2 * 24 * 60, { caseId: "case_115" }),
    item("wi_code_113", "coding", "ADMIN", `Code case ${caseNo("case_113")}`, "AI suggestions ready for review.", 8 * 60, { caseId: "case_113" }),
    item("wi_letter_114", "result_letter", "SURGEON", `Result letter — ${caseNo("case_114")}`, "Pathology reconciled; set surveillance and send letter.", 24 * 60, { caseId: "case_114" }),
    item("wi_hold_107", "med_hold_review", "NURSE", `Confirm apixaban hold — ${caseNo("case_107")}`, "Last dose not documented.", 10, { caseId: "case_107", patientId: "pat_107" }, "high"),
  ];
}

function seedAudit(state: DemoState): AuditEvent[] {
  const specById = new Map(CASE_SPECS.map((spec) => [spec.id, spec]));
  const events: AuditEvent[] = [...state.cases.values()].flatMap((procedureCase) => {
    const spec = specById.get(procedureCase.id);
    if (!spec) return [];
    return Object.entries(procedureCase.timestamps).map(([phase, at], index) => {
      const actor = actorFor(phase as CasePhase, spec.team);
      return {
        id: `aud_${procedureCase.id}_${index}`,
        at: at ?? "",
        actor: { id: actor.id, name: actor.name, role: actor.role },
        action: index === 0 ? "case.book" : "case.transition",
        entity: { type: "ProcedureCase", id: procedureCase.id },
        summary: index === 0 ? `Booked ${procedureCase.caseNumber} (${procedureCase.procedureLabel})` : `${procedureCase.caseNumber} → ${phase}`,
        outcome: "success" as const,
      };
    });
  });
  const extra: AuditEvent[] = [...state.notes.values()]
    .filter((note) => note.signedAt)
    .map((note) => ({
      id: `aud_sign_${note.id}`,
      at: note.signedAt ?? "",
      actor: { id: note.signedBy?.id ?? "", name: note.signedBy?.name ?? "", role: "SURGEON" as const },
      action: "note.sign",
      entity: { type: "NoteDraft", id: note.id },
      summary: `Signed procedure note v${note.version}`,
      outcome: "success" as const,
      agentExecutionId: `agx_${note.id}`,
    }));
  return [...events, ...extra].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

function seedQuality(anchor: number): QualityPoint[] {
  const random = seededRandom(20_260_928);
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(anchor - (29 - index) * DAY * 60_000);
    const cases = 16 + Math.round(random() * 10);
    return {
      date: toIsoDate(date),
      cases,
      adr: Math.round((0.3 + random() * 0.12) * 1000) / 1000,
      cir: Math.round((0.95 + random() * 0.04) * 1000) / 1000,
      withdrawalMin: Math.round((7.2 + random() * 2.6) * 10) / 10,
      bbpsAdequate: Math.round((0.86 + random() * 0.1) * 1000) / 1000,
      turnaroundMin: Math.round(11 + random() * 7),
    };
  });
}
