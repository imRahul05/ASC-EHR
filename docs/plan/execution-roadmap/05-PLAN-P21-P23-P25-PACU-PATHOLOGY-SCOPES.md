# Plan 05 — `P21` PACU & discharge · `P23` pathology closed loop · `P25` scope register & adverse events

> These are three **separate PRs**, and they can run in parallel worktrees (different domain files). Each PR adds its own `services/case-hydrators/<domain>.ts` so none of them collide in `case-read-service.ts`.
> Shared guardrails: no `any`/`unknown`; leaf exports (`LM-005`); hook budget (`LM-003`); `clinicalMutationRoute` (`LM-037`/`LM-038`); MSW lockstep (`LM-006`); ≤400 lines per commit; regulatory JSDoc citations (AGENTS.md #8).

---

## A. `P21` — PACU, discharge and the final discharge gate (US-F-10, US-F-11, US-F-12, US-F-13)
**Branch:** `phase/P21-pacu-discharge` · **Depends on:** P20 (pacu vitals path)
**What already exists:** `aldreteTotal`, `padssTotal`, `dischargeGate`, `finalDischargeGate`, the discharge-instructions agent and schema, UI in `tabs/recovery/*`, client `saveAldrete` / `generateDischargeInstructions` / `approveDischargeInstructions` / `dischargeCase`, route patterns. Capabilities: `pacu.document`, `discharge.approve` (step-up).
**Citations:** **CMS 42 CFR §416.52(c)** (discharge: physician-signed order or criteria applied, a responsible adult escort, and written instructions), **Modified Aldrete ≥9 / PADSS ≥9**.

1. **Contracts:** `packages/validation/src/discharge.ts` (`saveAldreteSchema`, `savePadssSchema`, `escortHandoffSchema` {escortName, relationship, phone, confirmedAt}, `dischargeCaseSchema`). Add a `PadssScore` type and an optional `CaseDetail.padss` / `escortHandoff` (additive).
2. **Rules:** extend `finalDischargeGate` to also require PADSS ≥9, the escort handoff confirmed **at the door** (US-F-11) and the instructions approved, then export `evaluateDischargeReadiness`. Add tests (Aldrete 9 with one component at 0 is blocked).
3. **FHIR:** `builders/pacu.ts` covers Aldrete/PADSS `Observation`s (component scores), the escort `RelatedPerson` handoff `Observation`, and the discharge-instructions `DocumentReference` + `Communication`.
4. **API:** `routes/discharge.ts` provides `POST /cases/:caseId/aldrete`, `POST …/padss`, `POST …/discharge-instructions` (agent via `runAgent`; abstention creates a work item), `POST …/discharge-instructions/approve` (`discharge.approve`, step-up), `POST …/escort-handoff`, and `POST …/discharge` (gate check → 409; stage `pacu → discharged`; creates a T+1 business-day `preop_call`-style follow-up Task of type `cancelled_followup` **or** a new `post_op_call` type. If you add a type, add it to `WORK_ITEM_TYPES`, `WORK_ITEM_QUEUE_MAP`, the FHIR task map and `work-item-links.ts`).
5. **Web/MSW:** wire `PadssScorer` to the API, add an `EscortHandoffCard`, update the discharge panel gate checklist, and mock in lockstep. Update `PROGRESS.md`.

---

## B. `P23` — pathology closed loop (EP-H: US-H-01..09)
**Branch:** `phase/P23-pathology-loop` · **Depends on:** P18, P12
**What already exists:** `surveillanceInterval` (USMSTF 2020), types `PathologyResult`, `CasePathology`, `ResultLetter`, UI in `tabs/pathology/*` and `features/pathology/pathology-queue.tsx`, client hooks, route patterns. Capabilities: `specimen.manage`, `pathology.reconcile`, `pathology.letter.send`, `fax.send`.
**Citations:** **CMS 42 CFR §416.47(b)** (records include pathology reports), **CLIA 42 CFR §493.1291** (test report handling), **USMSTF 2020 post-polypectomy surveillance**, **CAP specimen-labelling guidance**.

1. **Contracts:** `packages/validation/src/pathology.ts` (record result, reconcile, set surveillance, send letter, specimen count close).
2. **Rules:** `packages/clinical-rules/src/pathology/`:
   - `reconcile-match.ts` matches a result to a specimen by jar/site and flags mismatches.
   - `specimen-count.ts` (US-H-02): the number of specimens in the jar log must equal the number of biopsy/polyp events before `procedure_end`; otherwise there is a blocking gate. Wire it into `procedureEndGate`.
   - `overdue.ts` (US-H-06): a result is overdue after 7 days without one (configurable) and stays on the open-specimen register for up to 2 years.
   - `critical.ts` (US-H-08): adenocarcinoma or high-grade dysplasia creates a `stat` work item due within 1 hour, assigned to the gi-physician.
3. **FHIR:** `builders/specimen.ts` (`Specimen` with container/jar identifier), `builders/diagnostic-report.ts` (`DiagnosticReport` + `Observation`s), `builders/surveillance.ts` (`CarePlan`), `builders/result-letter.ts` (`Communication` + `DocumentReference`).
4. **API:** `routes/pathology.ts` provides `POST /cases/:caseId/specimens` (the P18 version may already exist; extend it), `GET /cases/:caseId/pathology`, `POST …/pathology/results`, `POST …/pathology/reconcile`, `POST …/surveillance`, `POST …/letters` (fax via a stub adapter until P24), and `GET /pathology/queue` (facility pipeline) plus `GET /pathology/open-register`. Each specimen creates a `pending_pathology` Task; a result completes it; a critical result creates a stat Task. Optional bot: `apps/bots/src/task-specimen-outstanding.ts` (daily overdue sweep).
5. **Agents (optional, last commit):** a `pathology-reconcile` agent that suggests matches (≥3 evals). **Deterministic matching remains authoritative.**
6. **Web/MSW:** an open-register tab in `pathology-queue.tsx`, a critical banner, a specimen-count lock on the procedure tab, and mocks. Update `PROGRESS.md`.

---

## C. `P25` — scope register, reprocessing log, infection traceability and adverse events (EP-I: US-I-01..08; part of EP-L)
**Branch:** `phase/P25-scope-adverse` · **Depends on:** P18 (scope assignment exists), P12
**What already exists:** `evaluateScopeHangTime`, `SCOPE_HANG_TIME_HOURS`, P18 `scope-lock.ts` + `ScopeAssignmentRecord`. **There are no scope or adverse-event types, routes or UI.**
**Capabilities:** do **not** invent new ones unless they are needed. Reprocessing entries use `procedure.document`; the register master-data uses `admin.facility`; the traceability query and adverse-event reports use `quality.read`, and adverse-event creation uses `procedure.document`. If a dedicated `scope.reprocess` capability is required, add it to `CAPABILITY_CATALOG`, give it to the role templates (tech, circulating RN) with `rw("Device")` and `rw("Procedure")` data rights, and update the `matrix.test.ts` and snapshot (`LM-014`).
**Citations:** **ANSI/AAMI ST91:2021**, **SGNA Standards of Infection Prevention in Reprocessing**, **FDA 21 CFR §803** (device-related adverse event / MDR), **CMS 42 CFR §416.51** (infection control), **CMS 42 CFR §416.43** (QAPI adverse event tracking).

1. **Types/validation:** `ScopeDevice { id, serial, model, type, status: "in_service"|"quarantined"|"retired" }`, `ReprocessCycle { scopeSerial, startedAt, completedAt, aerId, leakTest, hldOutcome, technicianId, hangExpiresAt }`, `ScopeTraceabilityReport { scopeSerial, cases: {caseId, patientRef, procedureDate}[], cycles }`, `AdverseEventReport { caseId, category: "perforation"|"bleeding"|"cardiopulmonary"|"sedation"|"transfer"|"infection"|"other", severity, occurredAt, description, deviceSerial?, transferredToHospital }`. Schemas go in `packages/validation/src/{scope-log,adverse-event}.ts`.
2. **Rules:** `scope-register.ts` blocks assignment when `status !== "in_service"`, computes the hang expiry from the last cycle (reusing scope-lock), and auto-quarantines on a leak-test FAIL. `traceability.ts` returns every case that used a scope between two passing cycles (the infection look-back query, US-I-07).
3. **FHIR:** `builders/device.ts` (`Device`), `builders/reprocess-cycle.ts` (`Procedure` with `focalDevice`), `builders/adverse-event.ts` (`AdverseEvent`).
4. **API:** `routes/scope-log.ts` provides `GET/POST /scopes`, `POST /scopes/:serial/cycles`, `GET /scopes/:serial/traceability`, `POST /cases/:caseId/adverse-events`, `GET /adverse-events`. Add the patterns to `packages/config/src/api.ts`. The P18 `POST /cases/:caseId/scope` must now look up the scope's latest cycle from the register (with a fallback to the manual input for demo data).
5. **Web/MSW:** an admin route `apps/web/src/app/(dashboard)/scopes/page.tsx` (register, cycle entry, traceability search) and an adverse-events page or tab, plus `ROUTE_ACCESS` and `nav-config` entries, and mocks. Update `PROGRESS.md`.

## Done when (each PR)
`pnpm check-types && pnpm lint && pnpm test && pnpm eval && pnpm build && pnpm --filter web test:bundles` are all green, `PROGRESS.md` is updated, and LMs are recorded.
