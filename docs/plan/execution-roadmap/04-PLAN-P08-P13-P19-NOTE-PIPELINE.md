# Plan 04 — `P08` + `P13` + `P19`: terminology, discrete findings and the AI procedure-note pipeline with signing (EP-G: `US-G-01`..`US-G-10`, `US-M-*`)

> **Branches (in order):** `phase/P08-terminology` → `phase/P13-record-engine` → `phase/P19-procedure-note`
> **Depends on:** P18 (events/specimens), P12 (sign Task). P20 can run in parallel.
> **What already exists:** UI in `apps/web/src/features/case/note/*`; client `clinical/note.ts` + `use-note-generation.ts`; `signGate`; types `NoteDraft`, `NoteSection`, `GapChip`, `CriticSuggestion`, `NoteStreamEvent`; route patterns `caseNote*`; `bbpsTotal`, `bbpsAdequate`, `withdrawalMinutes`; capabilities `note.draft`, `note.edit`, `note.sign` (step-up), `note.addend` (step-up), `ai.generate`.
> **Q-MS1 (MindScript record-engine port) is still open.** If it is still unanswered, P13 uses the **fallback**: a native lightweight section editor. Do not block on it.

## Guardrails
Same as the other plans. In addition, follow `docs/agent/ai-agents-guide.md`: use `runAgent`, BAA-only routing, zero PHI in prompts/logs beyond the BAA gateway, structured output, abstention leading to a work item (`buildAgentAbstentionWorkItem`), and ≥3 eval cases per agent (P01 eval gate enforces this). Citations: **CMS 42 CFR §416.47** (medical records content: findings, procedures, signed), **ASGE/ACG 2015 & 2022 Quality Indicators** (cecal intubation ≥95% screening, withdrawal ≥6 min, BBPS adequacy ≥85%), **Paris classification**, **21 CFR Part 11-style e-signature intent** (signature meaning, timestamp, step-up re-authentication), **HIPAA §164.312(c)** (integrity: signed note is immutable, so changes are addenda).

---

## P08 — terminology (2 commits)
1. `feat(fhir): GI code systems` — `packages/fhir/src/terminology/{gi-findings,colon-segments,paris,bbps,removal-method}.ts` as typed `CodeSystem`/`ValueSet` constants, plus `lookupDisplay(system, code)`. Map from the existing `AnatomicSite`/`RemovalMethod` labels in `procedure-labels.ts` (single source; re-use them, do not duplicate). Export `./terminology/*`.
2. `chore(bots): upload-conformance script` — `apps/bots/scripts/upload-conformance.ts` PUTs the CodeSystems/ValueSets to local Medplum. **Skip FSH/SUSHI for now** (defer to P26). CPT/ICD-10 loading is blocked on AMA licence (Q-CPT); use an internal GI subset constant list only.

## P13 — discrete findings and section record (2 commits)
1. `feat(types,validation): discrete findings` — extend `NoteFinding` with optional `parisClass`, `segment` (colon-segments code), `morphology`, `retrievalComplete`, `bbpsSegments`. Add `packages/validation/src/findings.ts` and `record/section.ts`.
2. `feat(ui,web): findings logger` — `packages/ui/src/components/record/{section-panel,lock-overlay}.tsx` (presentational). Upgrade `apps/web/src/features/case/procedure/findings-panel.tsx` (US-G-01) with Paris/segment/size pickers (useReducer), plus `POST /cases/:caseId/findings` → FHIR `Observation` (builder `builders/finding.ts`, route in `routes/procedure.ts` or the P18 service file — **extend, don't fork**).

## P19 — note pipeline (6 commits)
1. **Contracts** — `packages/validation/src/agents/{procedure-note,note-critic}.ts` (structured output: sections[] with `evidenceRefs` required, `abstain?: {reason}`), `notes/{sign,section-update}.ts`.
2. **Deterministic verification** — `packages/clinical-rules/src/verification/`:
   - `trace-to-source.ts`: every sentence that carries a finding must cite an existing finding/event/specimen id. If not, return a blocking `GapChip`.
   - `required-elements.ts` (US-G-05): indication, consent, sedation, extent reached/cecal landmarks, BBPS, withdrawal time, findings, specimens, complications, recommendations, surveillance placeholder. A missing element becomes a blocking gap.
   - `consistency.ts`: specimen count in the note equals `specimens.length`; withdrawal time equals the computed value; BBPS matches the recorded value.
   - Extend `signGate` to include these.
3. **Agents** — `packages/agents/src/agents/procedure-note/` and `note-critic/` (definition, input builder from `CaseDetail` with the patient name removed and only ids kept, prompt, ≥3 eval cases: normal screening, polypectomy with 3 specimens, incomplete exam with poor prep). Register both in `registry.ts`.
4. **Worker + API** — `apps/worker/src/jobs/procedure-note/index.ts` (draft → verify → persist `Composition` status `preliminary` → critic). Routes `apps/api/src/routes/notes.ts`:
   - `POST /cases/:caseId/note/generate` (`ai.generate`, enqueue job). The SSE stream uses the existing P10 envelope if it is merged; otherwise poll `GET /cases/:caseId/note` (keep the `NoteStreamEvent` type).
   - `GET /cases/:caseId/note`; `PATCH …/note/sections` (`note.edit`); `POST …/note/gaps/resolve`; `POST …/note/critic`.
   - `POST /cases/:caseId/note/sign` (`note.sign`, **step-up**, `If-Match`). Runs `signGate` (409 on failure), sets `Composition` to `final`, writes a `Provenance` with signature, makes the note immutable afterwards, completes the `sign_note` Task, and records `clinician-feedback` edit deltas (`packages/db/src/schema/clinician-feedback.ts` + migration; no PHI, only section ids and edit distances).
   - `POST /cases/:caseId/note/addendum` (`note.addend`, step-up).
   - FHIR builder `builders/procedure-note.ts` (`Composition` + `DocumentReference` PDF later).
5. **Client/Web** — wire the real endpoints; `SignNoteDialog` triggers the step-up flow (reuse the P05 step-up hook); add an addendum dialog; update MSW in lockstep.
6. **Docs** — `PROGRESS.md` (P08, P13, P19 done), and `LEARNING_MISTAKES.md` if anything was corrected.

## Done when
All gates pass, `pnpm eval` passes with the new agents, and a signed note cannot be edited (409). A note with a missing BBPS or a mismatched specimen count cannot be signed. An agent abstention creates a human `sign_note`/abstention work item.
