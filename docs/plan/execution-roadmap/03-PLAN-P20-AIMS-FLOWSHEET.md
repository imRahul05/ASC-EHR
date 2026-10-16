# Execution Plan 03 — `P20`: AIMS Anesthesia Flowsheet, Pre-Eval, Continuous Vitals & Offline Replay (`EP-F` & `EP-E`)

> **Target Branch:** `phase/P20-aims-flowsheet`
> **Master Spec Coverage:** `REQ-10` (Day of Surgery), `REQ-9` (Pre-Op Readiness), `US-F-08` (Sedation Medication Administration Log & Waste), `US-F-09` (Continuous AIMS Vitals Grid & Gaps), `US-E-05` (Pre-Anesthesia Medical Assessment: ASA, Mallampati, Airway), `NFR-2` (<500ms p95), `NFR-14` (Offline Tolerance & Zero Data Loss).
> **Dependencies:** `P01`/`P12` (PR #104 merged), `P18` (PR #105 merged). Can run in parallel with Plan 04 (`P19`).

---

## 1. Mandatory Pre-Flight Reading
Before writing any code, read:
1. [`LEARNING_MISTAKES.md`](../../../LEARNING_MISTAKES.md) (`LM-001`, `LM-003`, `LM-005`, `LM-006`, `LM-010`, `LM-014`, `LM-037`, `LM-038`, `LM-041`)
2. [`docs/product/master-requirements.md`](../../product/master-requirements.md) (§9 Pre-Op Readiness, §10 Day of Surgery Flow)
3. [`docs/product/master-build-specification.md`](../../product/master-build-specification.md) (`US-E-05`, `US-F-08`, `US-F-09`, `NFR-2`, `NFR-14`)
4. [`docs/plan/phases/P20-aims-flowsheet.md`](../phases/P20-aims-flowsheet.md)

## 2. Non-Negotiable Guardrails
- **Zero `any` and Zero `unknown`:** Strictly prohibited anywhere in `.ts` or `.tsx` files.
- **Leaf Subpath Imports (`LM-001`, `LM-005`):** Browser/app code MUST import leaf subpaths (`@asc/validation/aims.schema`, `@asc/clinical-rules/aims/*`, `@asc/fhir/builders/aims`, `@asc/config/api`), NEVER root barrel imports where forbidden. Every new module MUST be added to `package.json` `"exports"` and `src/index.ts`.
- **Closed Capability Catalog (`LM-014`):**
  - Use existing capability `"anesthesia.document"` for charting vitals, meds, airway events, and pre-anesthesia assessments (held by `anesthesia`, `gi-physician`, and `circulating-nurse`).
  - Do NOT invent new capabilities.
- **Composite Route Pre-Handler Pipeline (`LM-037`, `LM-038`):**
  - Use `clinicalMutationRoute` and `clinicalQueryRoute` from `apps/api/src/hooks/pipeline.ts` for all `/cases/:caseId/*` routes.
- **Separate Hydrator File (`case-read-service.ts` hygiene):**
  - Create `apps/api/src/services/case-hydrators/anesthesia.ts` to hydrate `CaseDetail.anesthesia` and avoid monolithic file bloat or merge collisions.
- **React Hook Budget (`LM-003`):** `useState <= 2`, `useEffect <= 1`, `useLayoutEffect <= 1`, `useRef <= 2` per component. Use `useReducer` for multi-field forms.
- **Regulatory Citations (`AGENTS.md` Rule #8):**
  - **CMS 42 CFR § 416.42(a)**: Condition for Coverage: Surgical and Anesthesia Services — Mandatory pre-anesthesia evaluation by a qualified practitioner immediately prior to surgery.
  - **ASA Standards for Basic Anesthetic Monitoring (October 2020)**: Continuous evaluation of oxygenation (pulse oximetry), ventilation (continuous EtCO2 capnography from sedation start to end), and circulation (arterial blood pressure and heart rate at least every 5 minutes).
  - **ASA Physical Status Classification System (ASA I–V)** & **Mallampati Airway Classification (Class I–IV)**.
  - **DEA 21 CFR § 1304.22(c) / § 1304.11**: Controlled substance administration and witness disposal of wasted narcotics (fentanyl, midazolam).
- **Atomic Commits (`AGENTS.md` Rule #4):** 6 atomic commits, `<= 400` changed lines per commit, green after every commit.

---

## Commit 1: `feat(types,validation): add AIMS pre-eval, controlled substance waste, and offline batch contracts`

### 1.1 Update `packages/types/src/clinical.ts`
Extend existing anesthesia types backward-compatibly:
- Add emergency reversal agents to `AnesthesiaDrug` (`REQ-10`):
  ```ts
  export type AnesthesiaDrug =
    | "propofol"
    | "midazolam"
    | "fentanyl"
    | "lidocaine"
    | "glycopyrrolate"
    | "ephedrine"
    | "phenylephrine"
    | "ondansetron"
    | "naloxone"     // Emergency opioid reversal
    | "flumazenil";   // Emergency benzodiazepine reversal
  ```
- Add `PreAnesthesiaAssessment` (`US-E-05`, CMS 42 CFR § 416.42(a)):
  ```ts
  export interface PreAnesthesiaAssessment {
    readonly asaClass: 1 | 2 | 3 | 4 | 5;
    readonly mallampati: 1 | 2 | 3 | 4;
    readonly airwayNotes?: string;
    readonly lastOralIntakeIso: string;
    readonly npoStatusSatisfied: boolean;
    readonly assessedAt: string;
    readonly assessedBy: StaffRef;
  }
  ```
- Add `ControlledSubstanceWaste` (`US-F-08`, 21 CFR § 1304.22):
  ```ts
  export interface ControlledSubstanceWaste {
    readonly drug: AnesthesiaDrug;
    readonly administeredAmount: number;
    readonly wastedAmount: number;
    readonly unit: DoseUnit;
    readonly witnessedBy: StaffRef;
    readonly witnessedAt: string;
    readonly reason?: string;
  }
  ```
- Extend `DrugDose` with optional `waste?: ControlledSubstanceWaste`.
- Extend `AnesthesiaRecord` with optional `preAssessment?: PreAnesthesiaAssessment | null`.
- Extend `AnesthesiaEntryPayload` to support pre-assessment and batch sync:
  ```ts
  export interface AimsBatchEntry {
    readonly clientId: string; // UUID generated offline for idempotency
    readonly caseId: string;
    readonly payload: AnesthesiaEntryPayload;
    readonly recordedAt: string;
  }
  ```

### 1.2 Create `packages/validation/src/aims.schema.ts` & Unit Tests
- Create `packages/validation/src/aims.schema.ts` defining:
  - `preAnesthesiaAssessmentSchema`:
    - `asaClass`: `z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])`
    - `mallampati`: `z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])`
    - `airwayNotes`: `z.string().trim().max(500).optional()`
    - `lastOralIntakeIso`: ISO date string
    - `npoStatusSatisfied`: `z.boolean()`
  - `anesthesiaEntrySchema`: Zod discriminated union on `kind`:
    - `dose`: `drug`, `amount` (`> 0`), `unit`, optional `waste` (`administeredAmount > 0`, `wastedAmount >= 0`, `witnessedBy`)
    - `vitals`: physiological ranges (HR 20–250, SBP 40–300, DBP 20–200, SpO2 50–100, RR 4–60, EtCO2 0–100, TempC 30–45)
    - `airway_event`: `type`, `note`
    - `sedation`: `edge: z.enum(["start", "end"])`
    - `setup`: `technique`, `device`, `o2Lpm` (0–15)
  - `aimsBatchSchema`: `z.object({ entries: z.array(z.object({ clientId: z.string().uuid(), payload: anesthesiaEntrySchema, recordedAt: z.string().datetime() })).min(1).max(200) })`
- Export `"./aims.schema": "./src/aims.schema.ts"` in `packages/validation/package.json` (`LM-005`) and re-export in `packages/validation/src/index.ts`.
- Add unit tests in `packages/validation/src/__tests__/aims.schema.test.ts`.

Verify with `pnpm --filter @asc/types check-types && pnpm --filter @asc/validation test` and commit.

---

## Commit 2: `feat(clinical-rules): add ASA 5-minute vitals monitoring gap, cumulative dose, and pre-anesthesia gate rules`

### 2.1 Create `packages/clinical-rules/src/aims/intervals.ts` (`US-F-09`)
Cite **ASA Standards for Basic Anesthetic Monitoring** (BP, HR, and EtCO2 ventilation must be recorded at least every 5 minutes from sedation start to end).
Implement:
1. `findMonitoringGaps(vitals: readonly VitalsEntry[], sedationStartIso?: string, sedationEndIso?: string, maxGapMinutes = 5): readonly MonitoringGap[]`
   - If `sedationStartIso` is present, sorts vitals in chronological order.
   - Calculates time elapsed between consecutive vital readings (and from sedation start to first reading, and from last reading to sedation end).
   - If any delta exceeds `maxGapMinutes * 60_000` ms, flags a `MonitoringGap` with `startIso`, `endIso`, and `gapDurationMinutes`.
   - Returns gaps for flowsheet timeline warnings and chart completeness checks.
2. `evaluateVitalsAdequacy(vitals: readonly VitalsEntry[], sedationStartIso?: string, sedationEndIso?: string): RuleResult`

### 2.2 Create `packages/clinical-rules/src/aims/dose-limits.ts` (`US-F-08`)
Implement advisory safety thresholds for cumulative sedation:
1. `ANESTHESIA_DOSE_THRESHOLDS: Readonly<Record<AnesthesiaDrug, { readonly warnThreshold: number; readonly unit: DoseUnit }>>`:
   - `fentanyl`: `warnThreshold: 200`, `unit: "mcg"`
   - `midazolam`: `warnThreshold: 5`, `unit: "mg"`
   - `propofol`: `warnThreshold: 300`, `unit: "mg"`
2. `evaluateCumulativeDoses(doses: readonly DrugDose[]): readonly DoseAdvisoryWarning[]`:
   - Aggregates total administered dose per drug.
   - Emits non-blocking advisory warnings when thresholds are exceeded so the clinician is alerted to respiratory depression risks.

### 2.3 Create `packages/clinical-rules/src/aims/pre-anesthesia.ts` (`US-E-05`, CMS 42 CFR § 416.42(a))
1. `evaluatePreAnesthesiaReadiness(assessment?: PreAnesthesiaAssessment | null): RuleResult`:
   - Requires completed pre-anesthesia assessment before `SEDATION_START` (`ok: false` if missing).
   - If `asaClass >= 4`, flags hard clinical blocker unless explicitly attested with director consultation.
   - If `npoStatusSatisfied === false`, flags mandatory NPO violation blocker.
2. `anesthesiaMinutes(sedationStartIso?: string, sedationEndIso?: string): number | null`:
   - Computes elapsed anesthesia minutes for billable anesthesia time units (`EP-J`/`P22b`).

### 2.4 Update `packages/clinical-rules/src/gates.ts`
- In `evaluateGate2`, connect `anesthesia_clearance` check to `evaluatePreAnesthesiaReadiness` when pre-assessment data is present on the case.
- Export `"./aims/*": "./src/aims/*.ts"` in `packages/clinical-rules/package.json` (`LM-005`) and re-export in `src/index.ts`.
- Add unit tests in `packages/clinical-rules/src/aims/__tests__/intervals.test.ts` (boundary tests at 5.0m vs 5.01m), `dose-limits.test.ts`, and `pre-anesthesia.test.ts`.

Verify with `pnpm --filter @asc/clinical-rules test` and commit.

---

## Commit 3: `feat(fhir): add discrete MedicationAdministration and intra-op vital Observations builders`

### 3.1 Extend `packages/fhir/src/urls.ts`
Add RxNorm and LOINC constants:
- `ANESTHESIA_DRUG_RXNORM`:
  - `propofol`: `"8782"`
  - `midazolam`: `"6960"`
  - `fentanyl`: `"4337"`
  - `lidocaine`: `"6387"`
  - `glycopyrrolate`: `"4918"`
  - `ephedrine`: `"3863"`
  - `phenylephrine`: `"8163"`
  - `ondansetron`: `"26225"`
  - `naloxone`: `"7242"`
  - `flumazenil`: `"22013"`
- LOINC codes:
  - `ETCO2`: `"19889-5"` (Carbon dioxide [Partial pressure] in Exhaled gas)
  - `ASA_PHYSICAL_STATUS`: `"75286-5"` (ASA physical status classification)
  - `MALLAMPATI_SCORE`: `"83033-1"` (Mallampati score)
  - `AIRWAY_EVENT`: `"59776-5"` (Procedure event)

### 3.2 Create `packages/fhir/src/builders/aims.ts` & Unit Tests
Implement discrete FHIR resource builders and parsers:
1. `buildMedicationAdministration(dose: DrugDose, caseId: string, facilityId: string, clientId?: string): MedicationAdministration`:
   - Builds FHIR R4 `MedicationAdministration` with `status: "completed"`, RxNorm code, `dosage.dose` with UCUM units (`mg`, `ug`), route `IV`, `performer` reference, and `identifier` holding `clientId` for idempotent replay.
   - Embeds controlled substance waste in `extension` (`ASC_EXTENSIONS.CONTROLLED_SUBSTANCE_WASTE`).
   - `parseMedicationAdministration(resource: MedicationAdministration): DrugDose`
2. `buildIntraopVitalsObservations(entry: VitalsEntry, caseId: string, facilityId: string, clientId?: string): readonly Observation[]`:
   - Builds discrete LOINC `Observation`s reusing `preop.ts` LOINC codes + EtCO2 `19889-5`.
3. `buildPreAnesthesiaObservation(assessment: PreAnesthesiaAssessment, caseId: string, facilityId: string): Observation`:
   - Builds discrete `Observation` holding ASA physical status and Mallampati classification components.
   - `parsePreAnesthesiaObservation(resource: Observation): PreAnesthesiaAssessment`
4. `buildAirwayEventObservation(event: AirwayEvent, caseId: string, facilityId: string): Observation`
- Export `"./builders/aims": "./src/builders/aims.ts"` in `packages/fhir/package.json` (`LM-005`) and re-export in `packages/fhir/src/index.ts`.
- Add unit tests in `packages/fhir/src/builders/aims.test.ts` with 100% round-trip coverage.

Verify with `pnpm --filter @asc/fhir test` and commit.

---

## Commit 4: `feat(api): wire AIMS routes, pre-anesthesia assessment, offline batch sync, and hydration`

### 4.1 Update `packages/config/src/api.ts`
Add under `API_PATHS`:
- `caseAimsBatch: (caseId: string) => \`/cases/\${caseId}/aims/batch\``
- `casePreAnesthesia: (caseId: string) => \`/cases/\${caseId}/anesthesia/pre-assessment\``

### 4.2 Create `apps/api/src/services/case-hydrators/anesthesia.ts`
Implement dedicated hydrator helper to populate `CaseDetail.anesthesia`:
- Queries Medplum for `MedicationAdministration` (linked to `Encounter/${caseId}`) and maps to `doses`.
- Queries `Observation`s with category `vital-signs` and `procedure` (airway events, pre-assessment).
- Assembles full typed `AnesthesiaRecord` with `preAssessment`.
- Wire into `apps/api/src/services/case-read-service.ts` (replacing the static empty stub).

### 4.3 Create `apps/api/src/services/aims-service.ts`, `controllers/aims.controller.ts`, and `routes/aims.ts`
- Routes in `apps/api/src/routes/aims.ts` using `clinicalMutationRoute` and `clinicalQueryRoute`:
  - `GET /cases/:caseId/anesthesia` (`capability: "anesthesia.document"`): returns hydrated `AnesthesiaRecord`.
  - `POST /cases/:caseId/anesthesia` (`capability: "anesthesia.document"`, `bodySchema: anesthesiaEntrySchema`):
    - When `kind === "sedation" && edge === "start"`: checks `evaluatePreAnesthesiaReadiness`. If pre-assessment is missing, returns HTTP 409 `GATE_FAILED` (`"Pre-anesthesia evaluation must be completed before starting sedation (CMS 42 CFR § 416.42(a))"`).
    - Persists entry (MedicationAdministration or discrete Observations) atomically using `forFacility(medplum, facilityId)`.
  - `POST /cases/:caseId/anesthesia/pre-assessment` (`capability: "anesthesia.document"`, `bodySchema: preAnesthesiaAssessmentSchema`):
    - Persists pre-anesthesia observation and updates readiness check `anesthesia_clearance = "satisfied"`.
  - `POST /cases/:caseId/aims/batch` (`capability: "anesthesia.document"`, `bodySchema: aimsBatchSchema`):
    - Loops over `entries`, checks if `clientId` already exists in `MedicationAdministration.identifier` or `Observation.identifier` (deduplication for offline replay).
    - Writes new entries in batch transaction. Returns `{ syncedCount, duplicateCount }`.
- Register `aimsRoutes` in `apps/api/src/routes/index.ts`.
- Add integration tests in `apps/api/src/routes/aims.test.ts` testing pre-eval requirement before sedation start, single entry, batch deduplication, and EtCO2 storage.

Verify with `pnpm --filter @asc/api test` and commit.

---

## Commit 5: `feat(api-client): implement offline queue with indexedDB and batch synchronization`

### 5.1 Create `packages/api-client/src/offline/queue.ts` (`NFR-14`)
Implement zero-dependency, lightweight IndexedDB FIFO queue:
- Stores `AimsBatchEntry` items with `clientId: crypto.randomUUID()`.
- Methods:
  - `enqueueAimsEntry(caseId: string, payload: AnesthesiaEntryPayload): Promise<string>`
  - `getPendingAimsEntries(caseId: string): Promise<readonly AimsBatchEntry[]>`
  - `flushAimsQueue(caseId: string, facilityId?: string): Promise<{ synced: number; remaining: number }>`
  - `clearAimsQueue(caseId?: string): Promise<void>`
  - `getAimsQueueSize(caseId?: string): Promise<number>`
- Add security purge: `clearAimsQueue()` is automatically called on `clearSession()` / logout so no clinical data persists on shared tablets.
- Unit tests in `packages/api-client/src/offline/queue.test.ts` (using `fake-indexeddb` or in-memory mock).

### 5.2 Update `packages/api-client/src/clinical/cases.ts` & `react/hooks.ts`
- In `packages/api-client/src/clinical/cases.ts`:
  - Add `submitPreAnesthesiaAssessment(caseId, payload, facilityId)`
  - Add `syncAimsBatch(caseId, entries, facilityId)`
- In `packages/api-client/src/react/hooks.ts`:
  - Update `useAddAnesthesiaEntry(caseId)`: when offline (`!navigator.onLine`), enqueues to `queue.ts` and optimistically updates TanStack Query cache.
  - Add `usePreAnesthesiaAssessment(caseId)` mutation hook.
  - Add `useOfflineAimsSync(caseId)` which listens to window `online` events and flushes the queue via `syncAimsBatch`.

Verify with `pnpm --filter @asc/api-client test` and commit.

---

## Commit 6: `feat(web): wire PreAnesthesiaCard, flowsheet monitoring gaps, offline queue badge, and update PROGRESS.md`

### 6.1 Create `PreAnesthesiaCard` and Update `anesthesia-tab.tsx`
- Create `apps/web/src/features/case/anesthesia/pre-anesthesia-card.tsx` (`US-E-05`):
  - Uses `useReducer` (`LM-003` — 1 hook) to handle ASA class (1–5), Mallampati score (1–4), airway notes, and last oral intake / NPO confirmation.
  - Submits via `usePreAnesthesiaAssessment(caseId)`.
  - When completed, shows verified green badge with ASA class and Mallampati score.
- Update `apps/web/src/features/case/tabs/anesthesia-tab.tsx`:
  - Fix root barrel import: change `@asc/clinical-rules` to leaf `@asc/clinical-rules/phases` (`LM-005`).
  - Wire `PreAnesthesiaCard` at top of tab before Sedation Start.
  - Display `OfflineQueueBadge` in header when pending offline items exist.
- In `apps/web/src/features/case/anesthesia/flowsheet-grid.tsx` and `anesthesia-header.tsx`:
  - Highlight 5-minute monitoring gaps using `findMonitoringGaps` from `@asc/clinical-rules/aims/intervals`.
  - Display advisory warning badge in `drug-log.tsx` if `evaluateCumulativeDoses` exceeds safety thresholds.

### 6.2 Lockstep MSW Mocks (`LM-006`) & `PROGRESS.md`
- Update `apps/web/src/mocks/handlers/clinical/cases.ts` and `apps/web/src/mocks/db/store.ts`:
  - Add handlers for `POST /cases/:caseId/anesthesia/pre-assessment` and `POST /cases/:caseId/aims/batch`.
  - Enforce 409 `GATE_FAILED` if sedation start is attempted without pre-assessment.
- Update `PROGRESS.md` marking `P20` as `done`.

Verify full monorepo:
```bash
pnpm check-types && pnpm lint && pnpm test && pnpm eval && pnpm build && pnpm --filter web test:bundles
```
