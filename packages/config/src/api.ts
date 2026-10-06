/**
 * HTTP API surface shared by @asc/api-client (callers), apps/api (routes) and
 * the apps/web dev mocks (MSW handlers), so paths are never retyped as strings.
 *
 * `API_ROUTE_PATTERNS` is the single source (`:param` form, used for route matching);
 * `API_ROUTES` builds concrete paths from it.
 */
export const API_ROUTE_PATTERNS = {
  health: "/health",
  authLogin: "/auth/login",
  authDemoLogin: "/auth/demo-login",
  authDemoPresets: "/auth/demo-presets",
  authSignup: "/auth/signup",
  authAccessRequest: "/auth/access-requests",
  me: "/me",

  // Patients & referrals (front desk)
  patients: "/patients",
  patientDuplicateCheck: "/patients/duplicate-check",
  patient: "/patients/:patientId",
  patientEligibility: "/patients/:patientId/eligibility",
  patientEscort: "/patients/:patientId/escort",
  referrals: "/referrals",
  referral: "/referrals/:referralId",
  referralConvert: "/referrals/:referralId/convert",

  // Schedule & cases
  schedule: "/schedule",
  scheduleConflicts: "/schedule/conflicts",
  cases: "/cases",
  case: "/cases/:caseId",
  caseTransition: "/cases/:caseId/transition",
  caseCheckIn: "/cases/:caseId/check-in",
  caseHp: "/cases/:caseId/hp",
  casePreOp: "/cases/:caseId/pre-op",
  caseVitals: "/cases/:caseId/vitals",
  caseConsentSign: "/cases/:caseId/consents/sign",
  caseTimeOut: "/cases/:caseId/time-out",
  caseEvents: "/cases/:caseId/events",
  caseBbps: "/cases/:caseId/bbps",
  caseNarration: "/cases/:caseId/narration",
  caseSpecimens: "/cases/:caseId/specimens",
  caseImages: "/cases/:caseId/images",
  caseAnesthesia: "/cases/:caseId/anesthesia",

  // AI note
  caseNote: "/cases/:caseId/note",
  caseNoteGenerate: "/cases/:caseId/note/generate",
  caseNoteSection: "/cases/:caseId/note/sections",
  caseNoteGapResolve: "/cases/:caseId/note/gaps/resolve",
  caseNoteCritic: "/cases/:caseId/note/critic",
  caseNoteSign: "/cases/:caseId/note/sign",

  // Recovery & discharge
  caseAldrete: "/cases/:caseId/aldrete",
  caseDischargeInstructions: "/cases/:caseId/discharge-instructions",
  caseDischargeInstructionsApprove: "/cases/:caseId/discharge-instructions/approve",
  caseDischarge: "/cases/:caseId/discharge",

  // Coding & pathology
  caseCoding: "/cases/:caseId/coding",
  caseCodingStatus: "/cases/:caseId/coding/status",
  caseCodingAttest: "/cases/:caseId/coding/attest",
  caseChargesExport: "/cases/:caseId/charges/export",
  casePathology: "/cases/:caseId/pathology",
  casePathologyResults: "/cases/:caseId/pathology/results",
  casePathologyReconcile: "/cases/:caseId/pathology/reconcile",
  caseSurveillance: "/cases/:caseId/surveillance",
  caseLetters: "/cases/:caseId/letters",
  pathologyQueue: "/pathology/queue",
  codingQueue: "/coding/queue",

  // Center-wide
  worklist: "/worklist",
  workItemComplete: "/worklist/:itemId/complete",
  whiteboard: "/whiteboard",
  quality: "/quality",
  audit: "/audit",
  admin: "/admin",
  dashboardSummary: "/dashboard/summary",
  search: "/search",

  // Patient portal
  portalMyCare: "/portal/my-care",
  portalPrep: "/portal/prep",
  portalEscort: "/portal/escort",

  // Demo only (MSW): re-seed the in-memory demo database
  demoReset: "/demo/reset",
} as const;

const P = API_ROUTE_PATTERNS;

function fill(pattern: string, params: Readonly<Record<string, string>>): string {
  return pattern.replace(/:(\w+)/g, (_match, key: string) => encodeURIComponent(params[key] ?? ""));
}

const byCase = (pattern: string) => (caseId: string) => fill(pattern, { caseId });

export const API_ROUTES = {
  health: P.health,
  authLogin: P.authLogin,
  authDemoLogin: P.authDemoLogin,
  authDemoPresets: P.authDemoPresets,
  authSignup: P.authSignup,
  authAccessRequest: P.authAccessRequest,
  me: P.me,

  patients: P.patients,
  patientDuplicateCheck: P.patientDuplicateCheck,
  patient: (patientId: string) => fill(P.patient, { patientId }),
  patientEligibility: (patientId: string) => fill(P.patientEligibility, { patientId }),
  patientEscort: (patientId: string) => fill(P.patientEscort, { patientId }),
  referrals: P.referrals,
  referral: (referralId: string) => fill(P.referral, { referralId }),
  referralConvert: (referralId: string) => fill(P.referralConvert, { referralId }),

  schedule: P.schedule,
  scheduleConflicts: P.scheduleConflicts,
  cases: P.cases,
  case: byCase(P.case),
  caseTransition: byCase(P.caseTransition),
  caseCheckIn: byCase(P.caseCheckIn),
  caseHp: byCase(P.caseHp),
  casePreOp: byCase(P.casePreOp),
  caseVitals: byCase(P.caseVitals),
  caseConsentSign: byCase(P.caseConsentSign),
  caseTimeOut: byCase(P.caseTimeOut),
  caseEvents: byCase(P.caseEvents),
  caseBbps: byCase(P.caseBbps),
  caseNarration: byCase(P.caseNarration),
  caseSpecimens: byCase(P.caseSpecimens),
  caseImages: byCase(P.caseImages),
  caseAnesthesia: byCase(P.caseAnesthesia),

  caseNote: byCase(P.caseNote),
  caseNoteGenerate: byCase(P.caseNoteGenerate),
  caseNoteSection: byCase(P.caseNoteSection),
  caseNoteGapResolve: byCase(P.caseNoteGapResolve),
  caseNoteCritic: byCase(P.caseNoteCritic),
  caseNoteSign: byCase(P.caseNoteSign),

  caseAldrete: byCase(P.caseAldrete),
  caseDischargeInstructions: byCase(P.caseDischargeInstructions),
  caseDischargeInstructionsApprove: byCase(P.caseDischargeInstructionsApprove),
  caseDischarge: byCase(P.caseDischarge),

  caseCoding: byCase(P.caseCoding),
  caseCodingStatus: byCase(P.caseCodingStatus),
  caseCodingAttest: byCase(P.caseCodingAttest),
  caseChargesExport: byCase(P.caseChargesExport),
  casePathology: byCase(P.casePathology),
  casePathologyResults: byCase(P.casePathologyResults),
  casePathologyReconcile: byCase(P.casePathologyReconcile),
  caseSurveillance: byCase(P.caseSurveillance),
  caseLetters: byCase(P.caseLetters),
  pathologyQueue: P.pathologyQueue,
  codingQueue: P.codingQueue,

  worklist: P.worklist,
  workItemComplete: (itemId: string) => fill(P.workItemComplete, { itemId }),
  whiteboard: P.whiteboard,
  quality: P.quality,
  audit: P.audit,
  admin: P.admin,
  dashboardSummary: P.dashboardSummary,
  search: P.search,

  portalMyCare: P.portalMyCare,
  portalPrep: P.portalPrep,
  portalEscort: P.portalEscort,

  demoReset: P.demoReset,
} as const;

/** Client-side request timeout for JSON API calls. */
export const HTTP_TIMEOUT_MS = 15_000;
