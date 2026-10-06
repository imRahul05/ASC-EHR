/**
 * GI ASC clinical domain (mock of the FHIR shapes that land in P02–P05).
 * Spec: docs/product/07-mock-frontend.md §3 · state machine: docs/product/04-end-to-end-flows.md §4.2.
 * All timestamps are ISO-8601 strings. All data in demos/fixtures is synthetic.
 */

/** ISO-8601 date-time string. */
export type IsoDateTime = string;
/** ISO-8601 calendar date `YYYY-MM-DD`. */
export type IsoDate = string;

// ─── Case phases ────────────────────────────────────────────────────────────

export type CasePhase =
  | "SCHEDULED"
  | "CONFIRMED"
  | "ARRIVED"
  | "PRE_OP"
  | "READY_FOR_PROCEDURE"
  | "IN_PROCEDURE"
  | "RECOVERY"
  | "READY_FOR_DISCHARGE"
  | "DISCHARGED"
  | "CHART_COMPLETE"
  | "CODED"
  | "EXPORTED"
  | "CLOSED"
  | "CANCELLED"
  | "NO_SHOW";

/** Colour group of a phase; maps 1:1 to the `--phase-<group>` design tokens. */
export type PhaseGroup = "scheduling" | "dayof" | "procedure" | "recovery" | "post" | "stopped";

// ─── Rules ──────────────────────────────────────────────────────────────────

export interface RuleReason {
  /** Stable machine code, e.g. `CONSENT_UNSIGNED`. */
  readonly code: string;
  /** Human sentence shown in the UI (no PHI). */
  readonly message: string;
}

export interface GateCheck {
  readonly code: string;
  readonly label: string;
  readonly ok: boolean;
}

/** Result of every gate / rule in @asc/clinical-rules. `reasons` lists only the failures. */
export interface RuleResult {
  readonly ok: boolean;
  readonly reasons: readonly RuleReason[];
  /** Optional full checklist (passing and failing items) for checklist UIs. */
  readonly checks?: readonly GateCheck[];
}

// ─── People & staff ─────────────────────────────────────────────────────────

export type Sex = "F" | "M" | "X";
/**
 * A person's job on the care team: a label on staff, work-queue owners and time-out
 * attestations. It says who does what in a case; it grants nothing (authorization is
 * capabilities from role templates in @asc/authz).
 */
export type ParticipantRole = "SURGEON" | "ANESTHESIOLOGIST" | "NURSE" | "ADMIN";

export interface StaffRef {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
}

export interface StaffMember extends StaffRef {
  readonly role: ParticipantRole;
  readonly title: string;
  readonly npi?: string;
  readonly active: boolean;
  readonly email: string;
}

export interface Address {
  readonly line: string;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
}

export type EligibilityStatus = "active" | "inactive" | "pending" | "error";

export interface EligibilityResult {
  readonly status: EligibilityStatus;
  readonly checkedAt: IsoDateTime;
  readonly copayCents?: number;
  readonly deductibleRemainingCents?: number;
  readonly message?: string;
  /** Mock X12 transaction id (270/271). */
  readonly transactionId: string;
}

export interface Coverage {
  readonly id: string;
  readonly payer: string;
  readonly planName: string;
  readonly memberId: string;
  readonly groupNumber?: string;
  readonly subscriberRelationship: "self" | "spouse" | "child" | "other";
  readonly eligibility: EligibilityResult | null;
}

export interface Escort {
  readonly name: string;
  readonly relationship: string;
  readonly phone: string;
  /** Confirmed before the day of the procedure. */
  readonly confirmed: boolean;
  /** Physically present for discharge. */
  readonly present: boolean;
}

export type AllergySeverity = "mild" | "moderate" | "severe";

export interface Allergy {
  readonly id: string;
  readonly substance: string;
  readonly reaction: string;
  readonly severity: AllergySeverity;
}

export type MedicationClass = "anticoagulant" | "antiplatelet" | "glp1" | "insulin" | "oral_hypoglycemic" | "iron" | "other";
export type HoldStatus = "not_required" | "pending" | "confirmed" | "not_held";

export interface HoldRule {
  /** Days before the procedure the medication must be stopped. */
  readonly daysBefore: number;
  readonly instruction: string;
  /** Guideline/protocol the rule comes from. */
  readonly source: string;
}

export interface Medication {
  readonly id: string;
  readonly name: string;
  readonly dose: string;
  readonly frequency: string;
  readonly medClass: MedicationClass;
  readonly holdRule: HoldRule | null;
  readonly holdStatus: HoldStatus;
  /** Date the patient last took it (for hold checks). */
  readonly lastTakenAt?: IsoDate;
}

export interface Patient {
  readonly id: string;
  readonly mrn: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: IsoDate;
  readonly sex: Sex;
  readonly phone: string;
  readonly email?: string;
  readonly address?: Address;
  readonly preferredLanguage: string;
  readonly coverage: Coverage | null;
  readonly escort: Escort | null;
  readonly allergies: readonly Allergy[];
  readonly medications: readonly Medication[];
  readonly referringProvider?: string;
  readonly createdAt: IsoDateTime;
}

/** Compact patient identity used on lists, cards and case payloads. */
export interface PatientRef {
  readonly id: string;
  readonly mrn: string;
  readonly displayName: string;
  readonly initials: string;
  readonly age: number;
  readonly sex: Sex;
  readonly dateOfBirth: IsoDate;
}

export interface PatientListItem extends PatientRef {
  readonly phone: string;
  readonly payer?: string;
  readonly eligibility?: EligibilityStatus;
  readonly allergyCount: number;
  readonly nextCaseId?: string;
  readonly nextCaseStart?: IsoDateTime;
}

// ─── Referrals (fax inbox) ──────────────────────────────────────────────────

export type ReferralStatus = "new" | "in_review" | "converted" | "rejected";
export type ReferralFactField =
  | "patientName"
  | "dateOfBirth"
  | "sex"
  | "phone"
  | "payer"
  | "memberId"
  | "reason"
  | "requestedProcedure"
  | "medications"
  | "allergies"
  | "referringProvider";

/** Character range inside `Referral.documentText` the fact was read from. */
export interface SourceSpan {
  readonly page: number;
  readonly start: number;
  readonly end: number;
}

export interface ExtractedFact {
  readonly id: string;
  readonly field: ReferralFactField;
  readonly label: string;
  readonly value: string;
  /** 0–1 model confidence. */
  readonly confidence: number;
  readonly sourceSpan: SourceSpan;
}

export interface Referral {
  readonly id: string;
  readonly receivedAt: IsoDateTime;
  readonly channel: "fax" | "e-referral";
  readonly fromPractice: string;
  readonly fromProvider: string;
  readonly pageCount: number;
  readonly priority: "routine" | "urgent";
  readonly status: ReferralStatus;
  /** OCR text of the (synthetic) fax, pages joined with `\f`. */
  readonly documentText: string;
  readonly extractedFacts: readonly ExtractedFact[];
  readonly provenance: AiProvenance;
  readonly patientId?: string;
  readonly caseId?: string;
}

// ─── Procedure case ─────────────────────────────────────────────────────────

export type ProcedureCode = "COLONOSCOPY" | "EGD" | "EGD_COLONOSCOPY" | "FLEX_SIG";
export type ProcedureIntent = "screening" | "surveillance" | "diagnostic";
export type AsaClass = 1 | 2 | 3 | 4;
export type Mallampati = 1 | 2 | 3 | 4;

export interface CaseTeam {
  readonly surgeon: StaffRef;
  readonly anesthesia: StaffRef;
  readonly nurse: StaffRef;
}

/** Denormalised readiness flags (kept current by the API on every command). */
export interface ReadinessFlags {
  readonly prepConfirmed: boolean;
  readonly eligibilityActive: boolean;
  readonly hpCurrent: boolean;
  readonly asaSet: boolean;
  readonly consentsSigned: boolean;
  readonly holdsConfirmed: boolean;
  readonly escortConfirmed: boolean;
  readonly npoConfirmed: boolean;
  readonly ivPlaced: boolean;
  readonly timeOutComplete: boolean;
}

export interface ProcedureCase {
  readonly id: string;
  /** Human case number, e.g. `C-24-0913`; safe for whiteboards (with initials). */
  readonly caseNumber: string;
  readonly patientId: string;
  readonly patient: PatientRef;
  readonly procedure: ProcedureCode;
  readonly procedureLabel: string;
  readonly intent: ProcedureIntent;
  readonly indication: string;
  readonly roomId: string;
  readonly scheduledStart: IsoDateTime;
  readonly durationMin: number;
  readonly team: CaseTeam;
  readonly phase: CasePhase;
  /** When the case entered each phase. */
  readonly timestamps: Partial<Record<CasePhase, IsoDateTime>>;
  readonly readiness: ReadinessFlags;
  readonly asa?: AsaClass;
  readonly npoSince?: IsoDateTime;
  readonly bbps?: BbpsScore;
  readonly cancelReason?: string;
}

// ─── Pre-procedure / pre-op ─────────────────────────────────────────────────

export interface AiProvenance {
  /** Agent id from @asc/agents, e.g. `procedure_note`. */
  readonly agent: string;
  readonly model?: string;
  readonly promptVersion: string;
  readonly generatedAt: IsoDateTime;
}

export interface PreVisitBrief {
  readonly summary: string;
  readonly flags: readonly string[];
  readonly provenance: AiProvenance;
}

export interface HpAssessment {
  readonly caseId: string;
  readonly status: "draft" | "signed";
  readonly asa: AsaClass | null;
  readonly mallampati: Mallampati | null;
  readonly airwayNotes: string;
  readonly heart: string;
  readonly lungs: string;
  readonly intervalHistory: string;
  /** Clinician confirmed each medication hold decision. */
  readonly holdsReviewed: boolean;
  readonly brief: PreVisitBrief | null;
  readonly performedBy?: StaffRef;
  readonly performedAt?: IsoDateTime;
  readonly signedAt?: IsoDateTime;
}

export type ConsentKind = "procedure" | "sedation" | "privacy";

export interface Consent {
  readonly id: string;
  readonly caseId: string;
  readonly kind: ConsentKind;
  readonly title: string;
  readonly summary: string;
  readonly status: "pending" | "signed" | "declined";
  readonly signerName?: string;
  readonly witness?: StaffRef;
  readonly signedAt?: IsoDateTime;
  /** Signature pad PNG data URL (kept in memory only). */
  readonly signatureDataUrl?: string;
}

export type VitalsContext = "pre_op" | "intra" | "pacu";

export interface VitalsEntry {
  readonly id: string;
  readonly caseId: string;
  readonly context: VitalsContext;
  readonly recordedAt: IsoDateTime;
  readonly hr: number;
  readonly sbp: number;
  readonly dbp: number;
  readonly spo2: number;
  readonly rr: number;
  readonly tempC?: number;
  readonly etco2?: number;
  /** 0–10 pain score. */
  readonly pain?: number;
  readonly recordedBy: StaffRef;
}

// ─── Procedure room ─────────────────────────────────────────────────────────

export type TimeOutRole = "SURGEON" | "NURSE" | "ANESTHESIOLOGIST";

export interface TimeOutChecklist {
  readonly patientIdentity: boolean;
  readonly procedureConfirmed: boolean;
  readonly consentVerified: boolean;
  readonly allergiesReviewed: boolean;
  readonly equipmentReady: boolean;
  readonly anticoagulationReviewed: boolean;
}

export interface TimeOutAttestation {
  readonly role: TimeOutRole;
  readonly by: StaffRef;
  readonly at: IsoDateTime;
}

export interface TimeOutRecord {
  readonly caseId: string;
  readonly checklist: TimeOutChecklist;
  readonly attestations: readonly TimeOutAttestation[];
  readonly completedAt?: IsoDateTime;
}

export type ProcedureEventType =
  | "SEDATION_START"
  | "SCOPE_IN"
  | "CECUM_REACHED"
  | "TERMINAL_ILEUM"
  | "WITHDRAWAL_START"
  | "POLYP_FOUND"
  | "SCOPE_OUT"
  | "SEDATION_END"
  | "COMPLICATION";

export interface ProcedureEvent {
  readonly id: string;
  readonly caseId: string;
  readonly type: ProcedureEventType;
  readonly at: IsoDateTime;
  readonly by: StaffRef;
  readonly note?: string;
}

/** Mock speech-to-text line from the procedure room. */
export interface NarrationSegment {
  readonly id: string;
  readonly caseId: string;
  readonly at: IsoDateTime;
  readonly speaker: string;
  readonly text: string;
}

export type AnatomicSite =
  | "cecum"
  | "ascending"
  | "hepatic_flexure"
  | "transverse"
  | "splenic_flexure"
  | "descending"
  | "sigmoid"
  | "rectum"
  | "terminal_ileum"
  | "esophagus"
  | "stomach"
  | "duodenum";

export type RemovalMethod = "cold_snare" | "hot_snare" | "cold_forceps" | "biopsy";

export interface Specimen {
  readonly id: string;
  readonly caseId: string;
  /** Jar letter A, B, C… */
  readonly jar: string;
  readonly site: AnatomicSite;
  readonly description: string;
  readonly sizeMm?: number;
  readonly removalMethod: RemovalMethod;
  readonly collectedAt: IsoDateTime;
  readonly pathologyStatus: "pending" | "resulted" | "reconciled";
}

export interface ImageCapture {
  readonly id: string;
  readonly caseId: string;
  readonly at: IsoDateTime;
  readonly site: AnatomicSite;
  readonly caption: string;
  readonly specimenId?: string;
}

/** Boston Bowel Preparation Scale, 0–3 per segment. */
export interface BbpsScore {
  readonly right: 0 | 1 | 2 | 3;
  readonly transverse: 0 | 1 | 2 | 3;
  readonly left: 0 | 1 | 2 | 3;
}

// ─── Anesthesia (AIMS) ──────────────────────────────────────────────────────

export type AnesthesiaTechnique = "MAC" | "moderate" | "general";
export type AnesthesiaDrug =
  | "propofol"
  | "midazolam"
  | "fentanyl"
  | "lidocaine"
  | "glycopyrrolate"
  | "ephedrine"
  | "phenylephrine"
  | "ondansetron";
export type DoseUnit = "mg" | "mcg" | "mL";

export interface DrugDose {
  readonly id: string;
  readonly drug: AnesthesiaDrug;
  readonly amount: number;
  readonly unit: DoseUnit;
  readonly route: "IV";
  readonly at: IsoDateTime;
  readonly by: StaffRef;
}

export type AirwayDevice = "nasal_cannula" | "face_mask" | "high_flow_nasal" | "lma" | "ett";
export type AirwayEventType = "jaw_thrust" | "chin_lift" | "o2_increased" | "desaturation" | "airway_inserted" | "apnea";

export interface AirwayEvent {
  readonly id: string;
  readonly type: AirwayEventType;
  readonly at: IsoDateTime;
  readonly note?: string;
}

export interface AnesthesiaRecord {
  readonly caseId: string;
  readonly provider: StaffRef;
  readonly technique: AnesthesiaTechnique;
  readonly airway: { readonly device: AirwayDevice; readonly o2Lpm: number };
  readonly airwayEvents: readonly AirwayEvent[];
  readonly sedationStart?: IsoDateTime;
  readonly sedationEnd?: IsoDateTime;
  readonly doses: readonly DrugDose[];
  /** 5-minute flowsheet rows (`context: "intra"`). */
  readonly vitals: readonly VitalsEntry[];
}

// ─── AI procedure note ──────────────────────────────────────────────────────

export type NoteStatus = "streaming" | "draft" | "signed";
export type NoteSectionId =
  | "indication"
  | "consent"
  | "sedation"
  | "procedure"
  | "findings"
  | "impression"
  | "recommendations"
  | "quality";

export interface NoteSection {
  readonly id: NoteSectionId;
  readonly title: string;
  readonly content: string;
  /** `ai` until a clinician edits it. */
  readonly source: "ai" | "edited";
  readonly confidence: number;
  /** Ids of events/specimens/images the text is grounded on. */
  readonly evidenceRefs: readonly string[];
  readonly editedBy?: StaffRef;
}

export interface NoteFinding {
  readonly id: string;
  readonly site: AnatomicSite;
  readonly description: string;
  readonly sizeMm?: number;
  readonly intervention: string;
  readonly specimenId?: string;
}

export interface GapChip {
  readonly id: string;
  readonly sectionId: NoteSectionId;
  readonly message: string;
  /** Blocking chips disable signing until resolved (signGate). */
  readonly blocking: boolean;
  readonly resolved: boolean;
  readonly resolution?: string;
}

export interface CriticSuggestion {
  readonly id: string;
  readonly sectionId: NoteSectionId;
  readonly message: string;
  readonly suggestedText?: string;
  readonly status: "open" | "accepted" | "dismissed";
}

export interface NoteDraft {
  readonly id: string;
  readonly caseId: string;
  readonly status: NoteStatus;
  readonly sections: readonly NoteSection[];
  readonly findings: readonly NoteFinding[];
  readonly provenance: AiProvenance;
  readonly gapChips: readonly GapChip[];
  readonly criticSuggestions: readonly CriticSuggestion[];
  readonly version: number;
  readonly signedBy?: StaffRef;
  readonly signedAt?: IsoDateTime;
}

interface NoteStreamBase {
  /** Monotonic sequence number within the stream (SSE `id`). */
  readonly seq: number;
  readonly ts: IsoDateTime;
}

/** Events of `POST /cases/:caseId/note/generate` (text/event-stream). Draft-first order:
 * started → section_delta… + section_complete (per section) → draft_ready → gap_chip / critic_suggestion / coding_ready → completed. */
export type NoteStreamEvent =
  | (NoteStreamBase & { readonly type: "started"; readonly noteId: string; readonly provenance: AiProvenance })
  | (NoteStreamBase & { readonly type: "section_delta"; readonly sectionId: NoteSectionId; readonly title: string; readonly delta: string })
  | (NoteStreamBase & { readonly type: "section_complete"; readonly section: NoteSection })
  | (NoteStreamBase & { readonly type: "draft_ready"; readonly note: NoteDraft })
  | (NoteStreamBase & { readonly type: "gap_chip"; readonly chip: GapChip })
  | (NoteStreamBase & { readonly type: "critic_suggestion"; readonly suggestion: CriticSuggestion })
  | (NoteStreamBase & { readonly type: "coding_ready"; readonly suggestionCount: number })
  | (NoteStreamBase & { readonly type: "completed"; readonly note: NoteDraft })
  | (NoteStreamBase & { readonly type: "failed"; readonly code: string; readonly message: string })
  | (NoteStreamBase & { readonly type: "heartbeat" });

export type NoteStreamEventType = NoteStreamEvent["type"];

// ─── Recovery & discharge ───────────────────────────────────────────────────

export type AldreteComponent = 0 | 1 | 2;

export interface AldreteInput {
  readonly activity: AldreteComponent;
  readonly respiration: AldreteComponent;
  readonly circulation: AldreteComponent;
  readonly consciousness: AldreteComponent;
  readonly oxygenSaturation: AldreteComponent;
}

export interface AldreteScore extends AldreteInput {
  readonly caseId: string;
  readonly total: number;
  readonly recordedAt: IsoDateTime;
  readonly recordedBy: StaffRef;
}

export interface InstructionSection {
  readonly title: string;
  readonly body: string;
}

export interface DischargeInstructions {
  readonly caseId: string;
  readonly status: "draft" | "approved";
  readonly language: string;
  readonly readingLevel: string;
  readonly sections: readonly InstructionSection[];
  readonly provenance: AiProvenance;
  readonly approvedBy?: StaffRef;
  readonly approvedAt?: IsoDateTime;
}

// ─── Coding & charges ───────────────────────────────────────────────────────

export type CodeSystem = "CPT" | "ICD10" | "MOD";
export type CodingStatus = "suggested" | "accepted" | "rejected" | "edited";
export type ChargeLineKind = "facility" | "professional" | "anesthesia";

export interface EvidenceRef {
  readonly kind: "note_section" | "finding" | "specimen" | "event" | "pathology";
  readonly id: string;
  readonly label: string;
}

export interface CodingSuggestion {
  readonly id: string;
  readonly caseId: string;
  readonly code: string;
  readonly system: CodeSystem;
  readonly description: string;
  /** 0–1. */
  readonly confidence: number;
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly rationale: string;
  readonly line: ChargeLineKind;
  readonly status: CodingStatus;
}

export interface CaseCoding {
  readonly caseId: string;
  readonly status: "not_ready" | "in_review" | "attested" | "exported";
  readonly suggestions: readonly CodingSuggestion[];
  readonly provenance: AiProvenance | null;
  readonly attestedBy?: StaffRef;
  readonly attestedAt?: IsoDateTime;
  readonly export?: ChargeExport;
}

export interface ChargeLine {
  readonly code: string;
  readonly modifiers: readonly string[];
  readonly diagnosisPointers: readonly string[];
  readonly units: number;
  readonly chargeCents: number;
  readonly line: ChargeLineKind;
}

export interface ChargeExport {
  readonly id: string;
  readonly caseId: string;
  readonly format: "837P" | "837I" | "CSV";
  readonly lines: readonly ChargeLine[];
  readonly totalCents: number;
  readonly createdAt: IsoDateTime;
  readonly status: "queued" | "sent" | "accepted";
  readonly batchId: string;
}

// ─── Pathology & surveillance ───────────────────────────────────────────────

export type Histology =
  | "tubular_adenoma"
  | "tubulovillous_adenoma"
  | "villous_adenoma"
  | "sessile_serrated_lesion"
  | "hyperplastic"
  | "normal_mucosa"
  | "adenocarcinoma"
  | "other";

export interface PathologyResult {
  readonly id: string;
  readonly caseId: string;
  readonly specimenId: string;
  readonly status: "received" | "reconciled";
  readonly receivedAt: IsoDateTime;
  readonly histology: Histology;
  readonly dysplasia: "none" | "low_grade" | "high_grade";
  readonly isAdenoma: boolean;
  readonly sizeMm?: number;
  readonly diagnosis: string;
  readonly reportText: string;
  readonly reconciledFindingId?: string;
}

export interface SurveillanceRecommendation {
  readonly intervalYears: number;
  readonly rationale: string;
  readonly guideline: string;
}

export interface SurveillancePlan extends SurveillanceRecommendation {
  readonly dueDate: IsoDate;
  readonly setBy: StaffRef;
  readonly setAt: IsoDateTime;
}

export interface ResultLetter {
  readonly id: string;
  readonly caseId: string;
  readonly recipient: "patient" | "referring_provider";
  readonly channel: "portal" | "fax" | "mail";
  readonly sentAt: IsoDateTime;
  readonly summary: string;
}

export interface CasePathology {
  readonly caseId: string;
  readonly specimens: readonly Specimen[];
  readonly results: readonly PathologyResult[];
  readonly recommendation: SurveillanceRecommendation | null;
  readonly surveillance: SurveillancePlan | null;
  readonly letters: readonly ResultLetter[];
}

// ─── Case workspace bundle ──────────────────────────────────────────────────

export interface CaseSummaryFlags {
  readonly noteStatus: NoteStatus | "none";
  readonly codingStatus: CaseCoding["status"];
  readonly specimensPending: number;
  readonly surveillanceSet: boolean;
  readonly lettersSent: number;
}

/** `GET /cases/:caseId` — everything the case workspace shell and day-of tabs need. */
export interface CaseDetail {
  readonly case: ProcedureCase;
  readonly patient: Patient;
  readonly hp: HpAssessment | null;
  readonly consents: readonly Consent[];
  readonly vitals: readonly VitalsEntry[];
  readonly timeOut: TimeOutRecord;
  readonly events: readonly ProcedureEvent[];
  readonly narration: readonly NarrationSegment[];
  readonly specimens: readonly Specimen[];
  readonly images: readonly ImageCapture[];
  readonly anesthesia: AnesthesiaRecord;
  readonly aldrete: AldreteScore | null;
  readonly discharge: DischargeInstructions | null;
  readonly summary: CaseSummaryFlags;
}

// ─── Schedule, rooms, whiteboard ────────────────────────────────────────────

export type RoomStatus = "idle" | "in_use" | "turnover" | "blocked";

export interface Room {
  readonly id: string;
  readonly name: string;
  readonly status: RoomStatus;
  readonly currentCaseId?: string;
}

export interface BlockTemplate {
  readonly id: string;
  readonly roomId: string;
  /** 0 = Sunday. */
  readonly dayOfWeek: number;
  readonly start: string;
  readonly end: string;
  readonly surgeonId: string;
}

export interface ScheduleDay {
  readonly date: IsoDate;
  readonly rooms: readonly Room[];
  readonly cases: readonly ProcedureCase[];
}

export interface ScheduleConflict {
  readonly kind: "room" | "surgeon" | "anesthesia" | "nurse" | "patient";
  readonly caseId: string;
  readonly message: string;
}

export interface ConflictCheckResult extends RuleResult {
  readonly conflicts: readonly ScheduleConflict[];
}

export interface WhiteboardCard {
  readonly caseId: string;
  readonly caseNumber: string;
  /** Initials only — whiteboards may be visible in public areas. */
  readonly initials: string;
  readonly phase: CasePhase;
  readonly roomId: string;
  readonly procedureLabel: string;
  readonly scheduledStart: IsoDateTime;
  readonly phaseEnteredAt?: IsoDateTime;
  readonly surgeonInitials: string;
  readonly flags: readonly ("allergy" | "anticoagulant" | "escort_missing" | "eligibility")[];
}

export interface WhiteboardBoard {
  readonly generatedAt: IsoDateTime;
  readonly rooms: readonly Room[];
  readonly cards: readonly WhiteboardCard[];
}

// ─── Work items, audit, quality, admin ──────────────────────────────────────

export type WorkItemType =
  | "sign_note"
  | "eligibility_failed"
  | "referral_intake"
  | "pending_pathology"
  | "coding"
  | "result_letter"
  | "med_hold_review";

export interface WorkItem {
  readonly id: string;
  readonly type: WorkItemType;
  readonly title: string;
  readonly detail: string;
  readonly ownerRole: ParticipantRole;
  readonly priority: "low" | "normal" | "high";
  readonly status: "open" | "done";
  readonly dueAt: IsoDateTime;
  readonly createdAt: IsoDateTime;
  readonly caseId?: string;
  readonly patientId?: string;
  readonly referralId?: string;
  readonly completedAt?: IsoDateTime;
}

export interface AuditActor {
  readonly id: string;
  readonly name: string;
  readonly role: ParticipantRole | "PATIENT" | "SYSTEM";
}

export interface AuditEvent {
  readonly id: string;
  readonly at: IsoDateTime;
  readonly actor: AuditActor;
  /** Dotted action, e.g. `case.transition`, `note.sign`, `charges.export`. */
  readonly action: string;
  readonly entity: { readonly type: string; readonly id: string };
  /** No PHI — ids, codes and phase names only. */
  readonly summary: string;
  readonly outcome: "success" | "denied" | "failure";
  readonly agentExecutionId?: string;
}

export interface QualityPoint {
  readonly date: IsoDate;
  readonly cases: number;
  /** Adenoma detection rate, 0–1. */
  readonly adr: number;
  /** Cecal intubation rate, 0–1. */
  readonly cir: number;
  readonly withdrawalMin: number;
  /** Share of cases with adequate prep (BBPS ≥ 6, each segment ≥ 2), 0–1. */
  readonly bbpsAdequate: number;
  readonly turnaroundMin: number;
}

export interface ProviderQuality {
  readonly provider: StaffRef;
  readonly cases: number;
  readonly adr: number;
  readonly cir: number;
  readonly withdrawalMin: number;
}

export interface QualityMetrics {
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly current: Omit<QualityPoint, "date">;
  readonly benchmarks: { readonly adr: number; readonly cir: number; readonly withdrawalMin: number; readonly bbpsAdequate: number };
  readonly history: readonly QualityPoint[];
  readonly byProvider: readonly ProviderQuality[];
}

export interface AgentSetting {
  readonly agent: string;
  readonly label: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly enabled: boolean;
  readonly description: string;
  /** Agent input may contain PHI (routes only to BAA-covered models). Unknown = treat as true. */
  readonly containsPhi?: boolean;
}

export interface AdminOverview {
  readonly staff: readonly StaffMember[];
  readonly rooms: readonly Room[];
  readonly blocks: readonly BlockTemplate[];
  readonly agents: readonly AgentSetting[];
}

export interface DashboardSummary {
  readonly date: IsoDate;
  readonly casesToday: number;
  readonly phaseCounts: Partial<Record<CasePhase, number>>;
  readonly inRoom: number;
  readonly inRecovery: number;
  readonly pendingSignatures: number;
  readonly openWorkItems: number;
  readonly pendingPathology: number;
  readonly adr30d: number;
  readonly onTimeStartRate: number;
}

export interface SearchResults {
  readonly patients: readonly PatientListItem[];
  readonly cases: readonly ProcedureCase[];
}

/** Items the command palette / worklists can reference. */
export interface PathologyQueueItem {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly patient: PatientRef;
  readonly procedureDate: IsoDateTime;
  readonly surgeon: StaffRef;
  readonly specimenCount: number;
  readonly resultedCount: number;
  readonly status: "awaiting" | "received" | "reconciled";
}

export interface CodingQueueItem {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly patient: PatientRef;
  readonly procedureLabel: string;
  readonly procedureDate: IsoDateTime;
  readonly phase: CasePhase;
  readonly status: CaseCoding["status"];
  readonly suggestionCount: number;
  readonly lowConfidenceCount: number;
}

// ─── Patient portal ─────────────────────────────────────────────────────────

export interface PrepItem {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly dueAt: IsoDateTime;
  readonly done: boolean;
}

export interface MyCare {
  readonly patient: Patient;
  readonly case: ProcedureCase | null;
  readonly prep: readonly PrepItem[];
  readonly instructions: DischargeInstructions | null;
  readonly letters: readonly ResultLetter[];
  readonly surveillance: SurveillancePlan | null;
}

// ─── Request payloads ───────────────────────────────────────────────────────

export interface PatientSearchQuery {
  readonly q?: string;
}

export interface CreatePatientPayload {
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: IsoDate;
  readonly sex: Sex;
  readonly phone: string;
  readonly email?: string;
  readonly address?: Address;
  readonly preferredLanguage?: string;
  readonly coverage?: Omit<Coverage, "id" | "eligibility">;
  readonly escort?: Omit<Escort, "present">;
  readonly allergies?: readonly Omit<Allergy, "id">[];
  readonly medications?: readonly Omit<Medication, "id" | "holdRule" | "holdStatus">[];
  readonly referringProvider?: string;
  /** Set when the patient is created from a referral. */
  readonly referralId?: string;
}

export interface DuplicateCheckPayload {
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: IsoDate;
}

export interface DuplicateMatch {
  readonly patient: PatientListItem;
  /** 0–1 match score. */
  readonly score: number;
  readonly reasons: readonly string[];
}

export interface DuplicateCheckResult {
  readonly matches: readonly DuplicateMatch[];
}

export interface ConvertReferralPayload {
  /** Link to an existing patient, or create one from the given fields. */
  readonly patientId?: string;
  readonly patient?: CreatePatientPayload;
}

export interface ConvertReferralResult {
  readonly referral: Referral;
  readonly patient: Patient;
}

export interface BookCasePayload {
  readonly patientId: string;
  readonly procedure: ProcedureCode;
  readonly intent: ProcedureIntent;
  readonly indication: string;
  readonly roomId: string;
  readonly scheduledStart: IsoDateTime;
  readonly durationMin: number;
  readonly surgeonId: string;
  readonly anesthesiaId: string;
  readonly nurseId: string;
  readonly referralId?: string;
}

export interface TransitionCasePayload {
  readonly to: CasePhase;
  readonly reason?: string;
}

export interface CheckInPayload {
  readonly escortPresent: boolean;
  readonly npoConfirmed: boolean;
}

export type SaveHpPayload = Partial<
  Pick<HpAssessment, "asa" | "mallampati" | "airwayNotes" | "heart" | "lungs" | "intervalHistory" | "holdsReviewed">
> & {
  /** Sign the H&P (makes it "current" for the readiness gate). */
  readonly sign?: boolean;
  /** Per-medication hold decisions. */
  readonly holdDecisions?: readonly { readonly medicationId: string; readonly holdStatus: HoldStatus }[];
};

export interface SavePreOpPayload {
  readonly npoConfirmed?: boolean;
  readonly ivPlaced?: boolean;
  readonly escortConfirmed?: boolean;
  readonly escortPresent?: boolean;
  readonly prepConfirmed?: boolean;
}

export type SaveVitalsPayload = Omit<VitalsEntry, "id" | "caseId" | "recordedAt" | "recordedBy"> & {
  readonly recordedAt?: IsoDateTime;
};

export interface SignConsentPayload {
  readonly consentId: string;
  readonly signerName: string;
  readonly signatureDataUrl?: string;
}

export interface AttestTimeOutPayload {
  readonly role: TimeOutRole;
  readonly checklist: TimeOutChecklist;
}

export interface AddProcedureEventPayload {
  readonly type: ProcedureEventType;
  readonly note?: string;
  readonly at?: IsoDateTime;
}

export type AddSpecimenPayload = Pick<Specimen, "site" | "description" | "removalMethod"> & { readonly sizeMm?: number };
export type AddImagePayload = Pick<ImageCapture, "site" | "caption"> & { readonly specimenId?: string };

export type AnesthesiaEntryPayload =
  | { readonly kind: "dose"; readonly drug: AnesthesiaDrug; readonly amount: number; readonly unit: DoseUnit; readonly at?: IsoDateTime }
  | { readonly kind: "vitals"; readonly vitals: SaveVitalsPayload }
  | { readonly kind: "airway_event"; readonly type: AirwayEventType; readonly note?: string }
  | { readonly kind: "sedation"; readonly edge: "start" | "end" }
  | { readonly kind: "setup"; readonly technique?: AnesthesiaTechnique; readonly device?: AirwayDevice; readonly o2Lpm?: number };

export interface UpdateNoteSectionPayload {
  readonly sectionId: NoteSectionId;
  readonly content: string;
}

export interface ResolveGapChipPayload {
  readonly chipId: string;
  readonly resolution: string;
  /** Optional replacement text for the chip's section. */
  readonly sectionContent?: string;
}

export interface UpdateCriticSuggestionPayload {
  readonly suggestionId: string;
  readonly status: "accepted" | "dismissed";
}

export interface SignNotePayload {
  /** Explicit human attestation (never auto-signed). */
  readonly attest: true;
}

export type SaveAldretePayload = AldreteInput;

export interface DischargeCasePayload {
  readonly escortPresent: boolean;
}

export interface UpdateCodingStatusPayload {
  readonly suggestionId: string;
  readonly status: CodingStatus;
  /** Replacement code when status is `edited`. */
  readonly code?: string;
  readonly description?: string;
}

export interface ExportChargesPayload {
  readonly format: ChargeExport["format"];
}

export interface RecordPathologyPayload {
  readonly specimenId: string;
  readonly histology: Histology;
  readonly dysplasia: PathologyResult["dysplasia"];
  readonly diagnosis: string;
}

export interface ReconcilePathologyPayload {
  readonly resultId: string;
  readonly findingId?: string;
}

export interface SetSurveillancePayload {
  readonly intervalYears: number;
  readonly rationale: string;
}

export interface SendResultLetterPayload {
  readonly recipient: ResultLetter["recipient"];
  readonly channel: ResultLetter["channel"];
}

export interface WorklistQuery {
  readonly type?: WorkItemType;
  readonly role?: ParticipantRole;
  readonly status?: WorkItem["status"];
}

export interface AuditQuery {
  readonly action?: string;
  readonly role?: AuditActor["role"];
  readonly entityType?: string;
  readonly entityId?: string;
  readonly outcome?: AuditEvent["outcome"];
}

export interface UpdatePrepItemPayload {
  readonly itemId: string;
  readonly done: boolean;
}

export type UpdateEscortPayload = Omit<Escort, "present">;
