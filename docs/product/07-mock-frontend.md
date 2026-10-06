# 07 — Mock Frontend: End-to-End Clickable Workflow

**Purpose:** a complete, production-looking web frontend for the GI ASC EHR that runs **with no backend**. Every
screen talks to `@asc/api-client` exactly as production will; in dev, MSW (`apps/web/src/mocks`) answers from an
in-memory demo database. When `apps/api` + Medplum land (P02–P05), only the MSW layer is removed.

Sources: [01 requirements](01-requirements.md) · [03 architecture](03-target-architecture.md) ·
[04 flows](04-end-to-end-flows.md) · [06 MindScript integration](06-mindscript-integration.md) ·
[MindScript How It Works](../MindScript-How-It-Works.md) · [UI guidelines](../agent/ui-guidelines.md).

All data is synthetic. No real patient data anywhere (fixtures, screenshots, seeds).

---

## 1. Design system — "quiet clinical, one accent"

Look of a good product company site (Linear / Vercel / Stripe dashboard): neutral canvas, generous whitespace,
hairline borders, crisp type, **one** violet accent used sparingly for primary actions, focus, active nav and AI.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | near-white, faint cool tint | near-black, faint violet tint | page |
| `--card` | white | 1 step above bg | surfaces |
| `--primary` | violet `oklch(0.54 0.2 285)` | `oklch(0.7 0.16 285)` | primary buttons, active nav, focus ring |
| `--accent` | violet 4 % tint | violet 12 % | hover, selected rows |
| `--ai` / `--ai-foreground` | violet tint + violet text | same, dark | AI markers, draft banners, streaming |
| `--success` `--warning` `--destructive` `--info` | muted emerald / amber / red / sky | lighter | status only, never decoration |
| `--phase-*` | one muted tint per case-phase group (see §3) | | phase chips, whiteboard columns |

Rules: no gradients except one subtle hero glow on the landing page; no hex in components (tokens only); shadows
`shadow-xs`/`shadow-sm` only; radius `--radius: 0.75rem`; type = Geist, tight tracking on headings, `tabular-nums`
for clinical values; icons 16 px lucide via `@asc/ui/icons`; respect `prefers-reduced-motion`; WCAG AA contrast.
Colour is never the only signal (chip = colour + icon/text).

## 2. Personas & navigation

A persona is a label for one-click demo sign-in; it grants nothing. What a user sees comes from their role
assignments (templates in `@asc/authz`, per facility) → capabilities → workspace. Roles are data; there is no
role enum in the web app.

| Persona (demo preset) | Role assignments | Workspace (home) | Main nav |
|---|---|---|---|
| Front desk / Admin | `front-desk` @ Metro + `admin`, `coder`, `auditor` (all sites) | Center operations | Dashboard · Whiteboard · Schedule · Patients · Referrals · Worklist · Coding · Quality · Audit · Admin |
| Nurse | `rn` @ Metro | Nursing | Dashboard · Whiteboard · Schedule · Patients · Referrals · Worklist · Pathology |
| Gastroenterologist | `gi-physician` @ Metro | Physician | Dashboard · Whiteboard · Schedule · Patients · Referrals · Sign queue · Pathology · Coding · Quality |
| Anesthesia | `anesthesia` @ Metro | Anesthesia | Dashboard · Whiteboard · Schedule · Patients · Worklist |
| Patient | `patient` | Patient portal | My procedure · Prep · Escort · Results & instructions |

Not presets: `float@ascehr.demo` (`rn` at Metro, `gi-physician` at Lakeside: the facility switcher changes nav and
workspace) and `tech@ascehr.demo` (`tech` at Metro: added by identity data and workspace config only).

Nav is data: each entry in `NAV_ITEMS` lists the capabilities that show it (`lib/route-access.ts`), and the same
table guards every route (`RouteGuard` in the dashboard layout; a route missing from the table is denied).
Workspaces live in `lib/workspaces.ts` with their dashboards in `features/dashboard/dashboard-config.tsx`.
Global: command palette (⌘K) to jump to patient/case/route, theme toggle, persona, workspace and facility
switchers, "Reset demo data". There is no self-signup: `/signup` is a request for access.

## 3. Domain model (mock of FHIR shapes; types in `@asc/types/src/clinical.ts`)

`CasePhase` follows [04 §4.2](04-end-to-end-flows.md#42-case-state-machine-encounter-case-phase):
`SCHEDULED → CONFIRMED → ARRIVED → PRE_OP → READY_FOR_PROCEDURE → IN_PROCEDURE → RECOVERY → READY_FOR_DISCHARGE →
DISCHARGED → CHART_COMPLETE → CODED → EXPORTED → CLOSED`, plus `CANCELLED`, `NO_SHOW`.

Phase groups for colour: *scheduling* (SCHEDULED, CONFIRMED) · *day-of* (ARRIVED, PRE_OP, READY_FOR_PROCEDURE) ·
*procedure* (IN_PROCEDURE) · *recovery* (RECOVERY, READY_FOR_DISCHARGE) · *post* (DISCHARGED … CLOSED) · *stopped*.

Entities: `Patient` (+ `Coverage`, escort `RelatedPerson`, allergies, meds with hold flags), `Referral` (fax inbox
item with extracted facts + source spans), `ProcedureCase` (patient, procedure, intent, room, time, team, phase,
readiness checklist, timestamps), `HpAssessment` (ASA, Mallampati, airway, meds/holds), `Consent`, `VitalsEntry`,
`ProcedureEvent` (cecum reached, withdrawal start, scope out…), `Specimen` (jar, site, polyp link), `ImageCapture`,
`AnesthesiaRecord` (drugs, vitals flowsheet, airway events), `NoteDraft` (sections, findings, AI provenance, gap-chips,
status streaming/draft/signed), `AldreteScore`, `DischargeInstructions`, `CodingSuggestion` (CPT/ICD/modifier +
evidence refs + confidence), `ChargeExport`, `PathologyResult` (per specimen → adenoma?, surveillance interval),
`WorkItem` (Task: type, owner role, due, case link), `AuditEvent`, `QualityMetrics`.

Gates (pure functions, `@asc/clinical-rules`): `readinessGate(case)` → H&P current, ASA set, consents signed, holds
confirmed, escort confirmed, NPO; `dischargeGate(case)` → Aldrete ≥ 9 (no zeros), escort present; `signGate(note)` →
no blocking gap-chips; `transitionAllowed(from, to)`. Each returns `RuleResult { ok, reasons[] }`; UI shows reasons.

## 4. Routes (App Router, `apps/web/src/app`)

| Route | Screen | Owner |
|---|---|---|
| `/` | Landing page (product site: hero, how it works, modules, security, CTA) | A |
| `/login`, `/signup` | Sign-in + demo persona picker; request access (no self-signup) | A |
| `/dashboard` | Role home (config per role) | D |
| `/schedule` | Day board by room (time grid), book-case sheet (patient search, procedure, intent, room/block, team; conflict check) | A |
| `/patients`, `/patients/new`, `/patients/[patientId]` | List + search · registration (dup check, coverage, eligibility 270/271 mock, escort) · chart | A |
| `/referrals` | Fax inbox: document preview + AI-extracted facts with source highlights → create patient / book case | A |
| `/whiteboard` | Live board by phase columns, initials + case # only, room status | B |
| `/cases/[caseId]` | **Case workspace**: patient banner + phase stepper + gate panel + tabbed stages (below) | shell: foundation |
| ↳ tab `pre-procedure` | H&P (AI pre-visit brief), meds with hold rules, allergies, ASA/Mallampati | B |
| ↳ tab `pre-op` | Check-in, vitals, IV, NPO, consents with signature pad, readiness gate → Ready | B |
| ↳ tab `procedure` | Room mode (≥48 px targets): multi-role time-out, event taps with timer, live narration transcript (mock STT), specimen jars, image capture | C |
| ↳ tab `anesthesia` | AIMS flowsheet: vitals grid (5-min), drug administration, airway, sedation start/end | C |
| ↳ tab `note` | AI note: generate → streaming sections → draft-first review (exceptions first, provenance, gap-chips, critic suggestions) → sign with confirm | C |
| ↳ tab `recovery` | PACU vitals, Aldrete/PADSS scorer, discharge gate, AI discharge instructions, escort, discharge | D |
| ↳ tab `coding` | CPT/ICD/modifier suggestions with evidence links + confidence, coder attest, charge export | D |
| ↳ tab `pathology` | Specimen results reconcile to polyp, adenoma flag, surveillance interval, result letters | D |
| `/worklist` | Tasks by type: sign queue, eligibility failures, referral intake, pending path, coding queue | D |
| `/pathology` | Pending/received results across cases | D |
| `/coding` | Coding queue → case coding tab | D |
| `/quality` | ADR, cecal intubation, withdrawal time, BBPS, turnaround — charts | D |
| `/audit` | Audit log table with filters | D |
| `/admin` | Staff roster, rooms, block templates, AI agent settings (read-only view of models) | D |
| `/my-care` | Patient portal: procedure, prep checklist, escort, instructions, results | D |

Owners: **A** front desk & public · **B** day-of & pre-op · **C** procedure room & AI note · **D** recovery, back office,
portal, dashboards. Each owner edits only its routes, its `apps/web/src/features/<domain>/` folder, and new files.

## 5. Architecture of the mock

```text
page.tsx (thin) → features/<domain>/*.tsx → hooks from @asc/api-client/react (TanStack Query; shared by all features)
  → @asc/api-client/src/clinical/*.ts (http.get/post)  → [dev] MSW handlers apps/web/src/mocks/handlers/clinical/*.ts
                                                          → in-memory demo DB apps/web/src/mocks/db/*.ts (seed + mutations)
AI note stream: api-client streamNoteGeneration() reads text/event-stream from MSW (ReadableStream), same contract as SSE.
Gates: @asc/clinical-rules — used by UI (instant feedback) and by MSW handlers (server re-check), like production.
```

Session and demo data are in memory only (PHI rule); a full page reload returns to login and re-seeds.

**Hook convention (decided):** data hooks and query keys live in the package entry `@asc/api-client/react`
(`packages/api-client/src/react/`), not in `apps/web/src/features/<domain>/use-*.ts`. Four feature owners share the
same reads (`useCase` is used by every case tab), so one implementation avoids duplicates and keeps query keys in one
factory (`queryKeys`). Features may still add *UI-only* hooks in `features/<domain>/use-*.ts` (local state, derived
view models) — never fetch or define query keys there.

## 6. Demo script (the end-to-end walkthrough)

1. `/` → Sign in → pick **Front desk (ADMIN)**.
2. Referrals: open fax → extracted facts → *Create patient* → registration (dup check, coverage, eligibility ✓).
3. Schedule: *Book case* → colonoscopy, screening, Room 2 09:30 → case `SCHEDULED`; confirm prep → `CONFIRMED`.
4. Switch to **Nurse**: whiteboard → case → *Check in* → Pre-procedure (H&P brief, hold apixaban flag) → Pre-op
   (vitals, consents signed) → readiness gate green → `READY_FOR_PROCEDURE`.
5. Procedure tab (room mode): time-out (MD + RN + CRNA) → `IN_PROCEDURE`; tap cecum reached / withdrawal / scope
   out; log 2 polyp specimens; narration transcript streams. **Anesthesia**: flowsheet + propofol doses.
6. End procedure → `RECOVERY`. **Surgeon**: Note tab → *Generate* → streamed draft → fix 1 gap-chip → sign.
7. **Nurse**: Recovery → Aldrete 10 → discharge gate → AI instructions → Discharge.
8. **Admin/coder**: Coding → accept suggested 45385 + Z12.11 → attest → export charges.
9. Pathology → results arrive (tubular adenoma) → reconcile → surveillance 5 y → letter → `CLOSED`.
10. **Patient** portal shows instructions + result letter. Quality dashboard ADR updates. Audit log shows all.

---

## 7. Conventions for feature work

Foundation is in place (tokens, types, rules, API client + hooks, MSW demo DB, UI kit, shell, case workspace).
Feature owners write UI in **their own files only**; if the contract is missing something, add it in the owning
package (types → `@asc/types/src/clinical.ts`, rule → `@asc/clinical-rules`, call → `@asc/api-client/src/clinical` +
route in `@asc/config/api` + MSW handler) — never a local copy in `apps/web`.

### 7.1 Where things go

| What | Where |
|---|---|
| Screen UI | `apps/web/src/features/<domain>/*.tsx` (replace the placeholder file you own) |
| Data | `import { useCase, useTransitionCase, … } from "@asc/api-client/react"` — never `fetch`, never own query keys |
| Plain calls (rare, e.g. in an event handler) | `import { getCase, … } from "@asc/api-client"` |
| Gates / scores / labels / time | `@asc/clinical-rules` (`transitionGate`, `readinessGate`, `signGate`, `dischargeGate`, `PHASE_LABEL`, `aldreteTotal`, `surveillanceInterval`, `findScheduleConflicts`, `formatTime24` …) |
| Types | `import type { … } from "@asc/types"` (see `clinical.ts`) |
| Components | `@asc/ui` — see `packages/ui/CATALOG.md`; add reusable pieces there (deps only in `packages/ui`) |
| Icons | `@asc/ui/icons` |
| Toasts | `toast.success / toast.error` from `@asc/ui` (Toaster already mounted) |

Hooks (all in `@asc/api-client/react`): queries `usePatients(q)`, `usePatient`, `useReferrals`, `useReferral`,
`useSchedule(date?)`, `useCase`, `useNote`, `useCoding`, `usePathology`, `useWorklist(q)`, `useWhiteboard` (15 s
refetch), `useQualityMetrics`, `useAuditLog(q)`, `useAdminOverview`, `useDashboardSummary`, `useSearch(q)`,
`usePathologyQueue`, `useCodingQueue`, `useMyCare`. Mutations `useCreatePatient`, `useDuplicateCheck`,
`useCheckEligibility`, `useUpdateEscort(patientId)`, `useConvertReferral(referralId)`, `useBookCase`,
`useScheduleConflictCheck`, and per case (`caseId` arg): `useTransitionCase`, `useCheckIn`, `useSaveHp`, `useSavePreOp`,
`useSaveVitals`, `useSignConsent`, `useAttestTimeOut`, `useAddProcedureEvent`, `useRecordBbps`, `useAddNarration`,
`useAddSpecimen`, `useAddImage`, `useAddAnesthesiaEntry`, `useUpdateNoteSection`, `useResolveGapChip`,
`useUpdateCriticSuggestion`, `useSignNote`, `useSaveAldrete`, `useGenerateDischargeInstructions`,
`useApproveDischargeInstructions`, `useDischargeCase`, `useUpdateCodingStatus`, `useAttestCoding`, `useExportCharges`,
`useRecordPathologyResult`, `useReconcilePathology`, `useSetSurveillance`, `useSendResultLetter`; center
`useCompleteWorkItem`, `useUpdatePrepItem`, `useUpdateMyEscort`, `useResetDemo`.
Every mutation invalidates all clinical queries on success (so whiteboard, worklist, audit, dashboards stay in sync);
case commands also write the returned `CaseDetail` into `queryKeys.cases.detail(caseId)`.

Errors: rejections are `ApiError` (`status`, `code`, `message`, `details`). Gate violations → **422 `GATE_FAILED`**
(`details` = reason code → message); state conflicts → **409** (`TRANSITION_NOT_ALLOWED`, `INVALID_PHASE`,
`SCHEDULE_CONFLICT`, `NOTE_ALREADY_SIGNED`, `CODING_LOCKED` …). Show `error.message` in a toast; run the same
`@asc/clinical-rules` gate in the UI first so the button is disabled with reasons (`GateChecklist`).

### 7.2 AI note streaming

```tsx
const gen = useNoteGeneration(caseId); // @asc/api-client/react
// gen.start(), gen.cancel(); gen.status: idle | streaming | draft_ready | completed | failed | cancelled
// gen.sections: { id, title, content, complete }[] (text so far), gen.note (NoteDraft after draft_ready,
// enriched with gap_chip / critic_suggestion events), gen.codingSuggestionCount, gen.error, gen.startedAt
```

Low level: `streamNoteGeneration(caseId, onEvent, signal)` from `@asc/api-client` (fetch + text/event-stream reader,
resolves on `completed`/`failed` or abort). Event order: `started → section_delta… → section_complete` (×8 sections)
`→ draft_ready → gap_chip* → critic_suggestion* → coding_ready → completed` (~6 s). Generation requires phase ≥
RECOVERY (409 `NOTE_NOT_READY`); signing requires `signGate` (no unresolved blocking gap-chip).

### 7.3 Case workspace contract

`/cases/[caseId]?tab=<id>` — shell in `features/case/` (banner, stepper, `GatePanel` with the primary advance action
calling `transitionCase`, phase history). Tabs come from `CASE_TABS` in `features/case/case-tabs.ts`; each tab is
`features/case/tabs/<id>-tab.tsx` exporting `<Name>Tab({ caseId })`. Tabs read `useCase(caseId)` (already cached by
the shell) and render their own content; don't duplicate the banner or the advance button (you may add
tab-specific actions, e.g. check-in, discharge). Default tab follows the phase (`DEFAULT_TAB_BY_PHASE`).

### 7.4 Placeholder files per owner (replace in place, keep the export name)

| Owner | Files (under `apps/web/src/features/`) |
|---|---|
| A | `landing/landing-page.tsx` (`/`), `schedule/schedule-board.tsx`, `patients/patient-list.tsx`, `patients/patient-registration.tsx`, `patients/patient-chart.tsx` (`{ patientId }`), `referrals/referral-inbox.tsx`; restyle `components/auth/*` |
| B | `whiteboard/whiteboard-board.tsx`, `case/tabs/pre-procedure-tab.tsx`, `case/tabs/pre-op-tab.tsx` |
| C | `case/tabs/procedure-tab.tsx`, `case/tabs/anesthesia-tab.tsx`, `case/tabs/note-tab.tsx` |
| D | `dashboard/workspace-dashboard.tsx`, `worklist/worklist-view.tsx`, `pathology/pathology-queue.tsx`, `coding/coding-queue.tsx`, `quality/quality-dashboard.tsx`, `audit/audit-log.tsx`, `admin/admin-console.tsx`, `portal/my-care-view.tsx` (`?view=prep|escort|results`), `case/tabs/recovery-tab.tsx`, `case/tabs/coding-tab.tsx`, `case/tabs/pathology-tab.tsx` |

Shared shell (foundation owns; ask before changing): `components/shell/*` (`NAV_ITEMS`, top bar, ⌘K, persona
switcher), `features/case/{case-workspace,gate-panel,phase-history,case-tabs,use-case-tab}`, `mocks/**`.
Pages in `app/**/page.tsx` are thin and already point at the files above.

### 7.5 Demo data (seeded on every load / "Reset demo data")

Times are relative to *now* (floored to 15 min), so the live board is coherent at any hour. Rooms `room-1..3`.

| Phase | Case id | Patient | Notes |
|---|---|---|---|
| SCHEDULED | `case_109` (today) · `case_117` (tomorrow) | `pat_109` · `pat_110` | 109 eligibility **inactive** → confirm gate fails until `checkEligibility` |
| CONFIRMED | `case_105` · `case_112` (EGD) | `pat_105` (portal user Robert Miller) · `pat_112` | |
| ARRIVED | `case_108` | `pat_108` | GLP-1 (semaglutide) hold |
| PRE_OP | `case_107` | `pat_107` | readiness fails: H&P unsigned, consents pending, apixaban hold pending; penicillin anaphylaxis |
| READY_FOR_PROCEDURE | `case_104` | `pat_104` | time-out not attested |
| IN_PROCEDURE | `case_103` | `pat_103` | events up to withdrawal, jar A, narration; no scope-out yet |
| RECOVERY | `case_106` | `pat_106` | no Aldrete, no note; jar B size missing → blocking gap on generate |
| READY_FOR_DISCHARGE | `case_102` | `pat_102` | Aldrete 10, instructions draft, note draft (no blocking gaps) |
| DISCHARGED | `case_101` | `pat_101` | note draft with blocking gap (BBPS) → sign queue |
| CHART_COMPLETE | `case_113` | `pat_113` | note signed; coding in review; path received (not reconciled) |
| CODED | `case_114` | `pat_114` | attested; path reconciled; result letter pending |
| EXPORTED | `case_115` | `pat_115` | 837P exported; path **awaiting** |
| CLOSED | `case_116` | `pat_116` | surveillance 5 y set, letters sent |
| CANCELLED | `case_110` | `pat_110` | inadequate prep |
| NO_SHOW | `case_111` | `pat_111` | |

Referrals `ref_201`–`ref_204` (`ref_203` duplicates `pat_102` Angela Brooks for the dup-check demo; `ref_202` urgent,
warfarin). Staff: surgeons `usr_surgeon_01` (Dr. Arthur Vance, demo login), `stf_surgeon_02`, `stf_surgeon_03`;
anesthesia `usr_anesthesia_01`, `stf_crna_02`; nurses `usr_nurse_01`, `stf_nurse_02`, `stf_nurse_03`; admin
`usr_admin_01`, coder `stf_coder_01`, front desk `stf_frontdesk_01`. The mock reads the actor from the bearer token
(set on sign-in via `setAccessToken`) for audit events.

**Navigation note:** the session is in memory, so a hard reload (or a plain `<a href>`) signs you out — always use
`next/link` / `router.push`.

---

## 8. Onboarding & help

A first-time user can learn every feature without anyone explaining. All copy lives in one config module,
`apps/web/src/features/guide/guide-content.ts` (route help, per-tab help, tour steps, FAQ, shortcuts); presentational
pieces are in `@asc/ui` (`WelcomeDialog`, `TourChecklist`, `HelpSheet`, `HintStrip`).

| Piece | Where | Behaviour |
|---|---|---|
| Explainer | `/` hero + `/login` (under persona cards) | "New here? How the demo works" dialog; login says "Start with Front desk to follow the full story" |
| Welcome | after first sign-in | intro + 3 highlights; *Start guided tour* / *Explore on my own*; reopen from Help (?) or ⌘K |
| Guided tour | floating bottom-right checklist | 12 steps from §6 on seeded cases (`case_109` confirm, `case_107` pre-op, `case_104` time-out, `case_103` anesthesia + procedure, `case_106` note, `case_102` discharge, `case_113` coding, `case_115` pathology, portal). *Take me there* switches persona in-app (`switchRole`) and routes; steps with a case tick themselves when the case reaches the target (phase, note signed, charges exported) via `useCaseDetails`, others via *Mark done*. Collapsible, dismissable, resumable; auto-minimises on phones |
| Page help | top-bar `?` button and `?` key (ignored while typing) | right sheet: purpose, *Try this*, demo records, who sees it, demo vs production; case workspace shows help for the open tab |
| Tab hints | top of each case tab | one-line "How this tab works", dismissable per tab |
| Help center | `/guide` (every role's nav + ⌘K) | features by journey stage with *Open* / *As <persona>*, personas table, shortcuts, reset demo data, start/restart tour, FAQ |

Persistence: one `localStorage` key `asc-ehr.guide.v1` holding UI flags only — welcome seen, tour status, collapsed,
done step ids, hidden hint ids (LM-004: never PHI, tokens or profiles). Read through `useSyncExternalStore`; every
access is wrapped in try/catch, so blocked storage just means the guide forgets between reloads.
