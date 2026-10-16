# Execution Plan 06 — `P22b`: GI Coding Rules Engine, Multiple Endoscopy Reduction, Gate 3 & X12 837/835 Claims Cycle (`EP-J` & `EP-K`)

> **Target Branch:** `feat/p22b-gi-coding-and-837-claims`
> **Master Spec Coverage:** `REQ-14` (Coding & Charge Capture), `REQ-15` (Claims & Revenue Cycle), `US-J-01`..`US-J-08`, `US-K-01`..`US-K-11`, `US-D-08` (Auth Divergence Flag), `US-M-01..09` (AI Coding Suggestion Agent)
> **Dependencies:** `P01`/`P12` (PR #104), `P18` (PR #105), `P19` (Signed Procedure Note)

---

## 1. Mandatory Pre-Flight Reading
Before writing any code, read:
1. [`LEARNING_MISTAKES.md`](../../../LEARNING_MISTAKES.md) (`LM-001`, `LM-003`, `LM-005`, `LM-006`, `LM-014`, `LM-037`, `LM-038`)
2. [`docs/product/master-requirements.md`](../../product/master-requirements.md) (§14 Coding & Charge Capture, §15 Claims & Revenue Cycle)
3. [`docs/product/master-build-specification.md`](../../product/master-build-specification.md) (`EP-J`: `US-J-01`..`US-J-08`; `EP-K`: `US-K-01`..`US-K-11`; `US-D-08`)
4. [`docs/plan/phases/P22-coding-charge.md`](../phases/P22-coding-charge.md)

## 2. Non-Negotiable Guardrails
- **Zero `any` and Zero `unknown`:** Strictly prohibited in all `.ts` and `.tsx` files.
- **Leaf Subpath Imports (`LM-001`, `LM-005`):** Browser/app code MUST import leaf subpaths (`@asc/validation/coding.schema`, `@asc/clinical-rules/coding/*`, `@asc/fhir/builders/claim`, `@asc/config/api`), NEVER root barrel imports where forbidden. Add every new module to `package.json` `"exports"` and `src/index.ts`.
- **Closed Capability Catalog (`LM-014`):** Reuse existing capabilities from `packages/types/src/capability.ts`:
  - `"coding.review"` (`GET /coding/queue`, `GET /cases/:caseId/coding`, `POST /cases/:caseId/coding/status`)
  - `"coding.attest"` (`POST /cases/:caseId/coding/attest` — step-up verified)
  - `"charge.export"` (`POST /cases/:caseId/charges/export`)
- **Composite Route Pre-Handler Pipeline (`LM-037`, `LM-038`):** Use `clinicalQueryRoute` and `clinicalMutationRoute` from `apps/api/src/hooks/pipeline.ts` for all `/cases/:caseId/*` routes.
- **Regulatory Citations (`AGENTS.md` Rule #8):** Cite **ACA 42 U.S.C. § 300gg-13** & **CMS Transmittal R2124CP** (Modifier `PT` for Medicare and Modifier `33` for commercial screening-to-therapeutic colonoscopy conversion), **CMS Medicare Claims Processing Manual Ch. 12 § 40.6** (Multiple Endoscopy Rule / Base Code `45378` family reduction with Modifier `51`), **CMS NCCI Policy Manual Ch. 6** (Modifiers `59` / `XS` for distinct anatomical site interventions), and **HIPAA ANSI ASC X12N 837I (005010X223A2), 837P (005010X222A1), 277CA (005010X214), and 835 (005010X221A1)**.
- **Atomic Commits (`AGENTS.md` Rule #4):** 6 atomic commits, `<= 400` changed lines per commit, green after every commit.

---

## Commit 1: `feat(types,validation): add GI coding, multiple endoscopy math, and 837/835 claim schemas`

### 1.1 Extend `packages/types/src/clinical.ts`
Extend existing coding and charge interfaces (`CodingSuggestion`, `CaseCoding`, `ChargeLine`, `ChargeExport`) backward-compatibly:
- Add optional fields to `ChargeLine`:
  - `baseAllowedCents?: number`
  - `endoscopyFamilyBaseCode?: string`
  - `multipleEndoscopyReductionCents?: number`
  - `netExpectedReimbursementCents?: number`
  - `anatomicalSegment?: CecalLandmark`
- Add `AuthDivergenceAlert` (`US-D-08`, `US-J-05`):
  ```ts
  export interface AuthDivergenceAlert {
    readonly authorizedCpts: readonly string[];
    readonly billedCpts: readonly string[];
    readonly divergentCpts: readonly string[];
    readonly requiresRetroAuthOrAmendment: boolean;
    readonly message: string;
  }
  ```
- Extend `CaseCoding` with optional:
  - `authDivergence?: AuthDivergenceAlert | null`
  - `modifierPtOr33Applied?: "PT" | "33" | null`
  - `multipleEndoscopyApplied?: boolean`
  - `pathologyAddendumPending?: boolean` (`US-J-08`)
- Add `ClaimScrubIssue` (`US-K-03`), `EraPostingSummary` (`US-K-06`, `US-K-07`), and extend `ChargeExport` with optional `x12Payload?: string`, `acknowledgment277Status?: "PENDING" | "ACCEPTED" | "REJECTED"` (`US-K-04`), and `scrubIssues?: readonly ClaimScrubIssue[]`.

### 1.2 Create `packages/validation/src/coding.schema.ts` & Unit Tests
- Create `packages/validation/src/coding.schema.ts` defining:
  - `updateCodingStatusSchema` (`suggestionId`, `status: z.enum(["suggested", "accepted", "rejected", "edited"])`, `code?`, `description?`, `modifiers?`)
  - `attestCodingSchema` (`attestationNote?: string`, `overrideAuthDivergenceReason?: string`)
  - `exportChargesSchema` (`format: z.enum(["837P", "837I", "CSV"])`, `payerType?: z.enum(["medicare", "commercial", "medicaid", "self_pay"])`)
  - `codingQueueQuerySchema` (`status?: z.enum(["not_ready", "in_review", "attested", "exported"])`)
- Export `"./coding.schema": "./src/coding.schema.ts"` in `packages/validation/package.json` (`LM-005`) and re-export in `packages/validation/src/index.ts`.
- Create `packages/validation/src/__tests__/coding.schema.test.ts`.

Verify with `pnpm --filter @asc/types check-types && pnpm --filter @asc/validation test` and commit.

---

## Commit 2: `feat(clinical-rules): implement GI coding engine, PT/33 conversion, multiple endoscopy math, and Gate 3`

### 2.1 Create `packages/clinical-rules/src/coding/gi-coding-engine.ts`
Cite **ACA 42 U.S.C. § 300gg-13**, **CMS Transmittal R2124CP**, **CMS Claims Processing Manual Ch. 12 § 40.6**, and **CMS NCCI Ch. 6**.
Implement pure, deterministic functions:
1. `deriveGiCodingSuggestions(input: GiCodingInput): GiCodingDerivationResult` (`US-J-01`, `US-J-06`):
   - Maps colonoscopy/EGD findings + removal techniques to exact CPT codes:
     - Screening/diagnostic colonoscopy without intervention → `45378`
     - Cold forceps biopsy → `45380`
     - Submucosal injection / tattoo → `45381`
     - Cold or hot snare polypectomy → `45385`
     -Hot biopsy forceps → `45384`
     - EMR / complex lesion removal → `45390`
     - Incomplete colonoscopy (did not reach cecum) → appends Modifier `53` (discontinued after anesthesia) or `52` (`REQ-14`)
     - Diagnostic EGD → `43235`; EGD with biopsy → `43239`; EGD dilation → `43249`
   - Populates `evidenceRefs` linking every suggestion to exact `finding.id`, `specimen.id`, `note_section`, or `pathology.id` (`US-J-06`).
2. `applyScreeningToTherapeuticConversion(input)` (`US-J-02`):
   - When `intent === "screening"` and a therapeutic intervention (`45380`, `45384`, `45385`, `45390`) occurred:
     - Appends Modifier `"PT"` for Medicare (`payerType === "medicare"`) or Modifier `"33"` for commercial payers.
     - Orders ICD-10 diagnosis pointers so `Z12.11` (encounter for screening for malignant neoplasm of colon) remains primary (`Pointer A`) and polyp/lesion findings (`D12.*`, `K63.5`) are secondary (`Pointer B/C`) (`AC-J-02-1..3`).
3. `calculateMultipleEndoscopyReduction(lines: readonly ChargeLineInput[])` (`US-J-03`):
   - Within the colonoscopy base family (`45378`, base allowance e.g. `$210.00` = `21000` cents):
     - Highest-valued procedure in family is paid at `100%` of allowed amount.
     - Second and subsequent procedures in the `45378` family receive `(Procedure Allowed - Base 45378 Allowed)` and Modifier `51` (`AC-J-03-1..2`).
     - Procedures in a separate endoscopic family (e.g., EGD `43239` same session) are evaluated against their own base code (`43235`).
4. `applyDistinctAnatomicalSiteModifiers(findings)` (`US-J-04`):
   - When two different techniques (e.g., snare `45385` in ascending colon + cold biopsy `45380` in sigmoid colon) occur in distinct anatomical segments (`CecalLandmark`), appends Modifier `"XS"` (or `"59"`) to the secondary code (`AC-J-04-1`).
   - Suppresses unbundling modifier when performed on the same lesion in the same segment (`AC-J-04-2`).
5. `evaluatePriorAuthCodingDivergence(authorizedCpts, billedCpts)` (`US-D-08`, `US-J-05`):
   - Flags any billed therapeutic CPT not covered by the pre-authorized CPT set.
6. `evaluateGate3ClaimReadiness(coding: CaseCoding, noteSigned: boolean, specimenReconciled: boolean): GateResult` (`US-J-07`):
   - Blocks `signed_note -> claim_ready` unless:
     - Procedure note is signed (`noteSigned === true`)
     - Specimen reconciliation is complete (`specimenReconciled === true`)
     - At least 1 CPT and 1 ICD-10 code are accepted
     - Zero suggestions remain in `"suggested"` (unreviewed) state
     - `coding.status === "attested"` by coder or physician (`AC-J-07-1..3`).

### 2.2 Create `packages/clinical-rules/src/coding/x12-837-scrub.ts` (`US-K-01`..`US-K-03`)
Implement `scrubClaimForExport(input)` and `formatX12ClaimSummary(input)`:
- Validates NPI (Luhn 10-digit check), subscriber member ID, diagnosis pointers (`A`–`D`), place of service (`24` for ASC facility `837I` / `837P`), and Gate 3 attestation (`US-K-01`, `US-K-02`, `US-K-03`).
- Generates deterministic ANSI ASC X12 `837P` (005010X222A1) and `837I` (005010X223A2) envelope segments (`ISA`, `GS`, `ST*837`, `BHT`, `NM1`, `CLM`, `HI`, `SV1`/`SV2`, `SE`, `GE`, `IEA`) and CSV export rows.

### 2.3 Export & Test
- Add `"./coding/*": "./src/coding/*.ts"` in `packages/clinical-rules/package.json` (`LM-005`) and re-export in `packages/clinical-rules/src/index.ts`.
- Create `packages/clinical-rules/src/coding/__tests__/gi-coding-engine.test.ts` and `x12-837-scrub.test.ts`.

Verify with `pnpm --filter @asc/clinical-rules test` and commit.

---

## Commit 3: `feat(fhir): add FHIR Claim and ChargeItem builders for P22b coding and 837 export`

### 3.1 Create `packages/fhir/src/builders/claim.ts` & Unit Tests
- Implement `buildFhirClaim(input: BuildFhirClaimInput): Claim` and `mapFhirClaimToCaseCoding(claim: Claim): CaseCoding`:
  - Maps `CodingSuggestion`s, `ChargeLine`s, `Modifier PT/33/51/59/XS`, `diagnosis` sequence pointers, `total` money (`USD`), and `ASC_EXTENSIONS` for `evidenceRefs`, `authDivergence`, `x12Format`, and `acknowledgment277Status`.
- Export `"./builders/claim": "./src/builders/claim.ts"` in `packages/fhir/package.json` (`LM-005`) and re-export in `packages/fhir/src/index.ts`.
- Create `packages/fhir/src/builders/claim.test.ts` with 100% coverage.

Verify with `pnpm --filter @asc/fhir test` and commit.

---

## Commit 4: `feat(agents): add coding-suggest agent with provenance citations and eval cases`

### 4.1 Create `packages/agents/src/agents/coding-suggest/` (`US-J-01`, `US-M-01..09`)
- Create `packages/agents/src/agents/coding-suggest/agent.ts`, `prompt.ts`, and `eval.ts`:
  - Uses `Task.MedicalCoding` (`requiresBaa: true`).
  - Takes de-identified structured case context (`intent`, `findings`, `specimens`, `pathologyDiagnoses`, `landmarks`, `payerType`) and returns structured CPT/ICD-10/Modifier suggestions with mandatory `evidenceRefs` (`US-J-06`, `US-M-03`).
  - Includes 3 deterministic `EvalCase`s in `eval.ts` (`eg-screening-to-snare-polypectomy-medicare`, `eg-multi-segment-biopsy-and-snare-commercial`, `eg-incomplete-colonoscopy-poor-prep`) so `pnpm eval` (`eval-gate.test.ts` from P01) automatically tests `codingSuggestAgent`!
- Register `codingSuggestAgent` in `packages/agents/src/agents/registry.ts`.

Verify with `pnpm --filter @asc/agents test && pnpm eval` and commit.

---

## Commit 5: `feat(api): add coding queue, coding status, Gate 3 attestation, and 837 charge export routes`

### 5.1 Create `apps/api/src/services/coding-service.ts`, `controllers/coding.controller.ts`, and `routes/coding.ts`
- `coding-service.ts`:
  - `getCodingQueue(ctx, query)`: lists cases in post-procedure stages (`Complete` / `Recovery` / `Discharged`) with coding status, suggestion count, and low-confidence count (`capability: "coding.review"`).
  - `getCaseCoding(ctx, caseId)`: hydrates `CaseCoding` from Medplum `Claim` (or derives initial suggestions via `deriveGiCodingSuggestions` from case findings, specimens, intent, and note state) (`capability: "coding.review"`).
  - `updateCaseCodingSuggestion(ctx, caseId, body)`: updates suggestion status (`accepted` / `rejected` / `edited`), recalculates `applyScreeningToTherapeuticConversion`, `calculateMultipleEndoscopyReduction`, `applyDistinctAnatomicalSiteModifiers`, and `evaluatePriorAuthCodingDivergence` (`capability: "coding.review"`).
  - `attestCaseCoding(ctx, caseId, body)`: evaluates `evaluateGate3ClaimReadiness`. If blocked, throws `createGateBlockerError(gate.blockers, { gate: "GATE_3_CODING_ATTEST" })` (HTTP 409). Otherwise marks `CaseCoding.status = "attested"`, records `attestedBy` and `attestedAt`, completes any open `"coding"` `WorkItem` (`Task`), and logs audit event (`capability: "coding.attest"`).
  - `exportCaseCharges(ctx, caseId, body)`: enforces `coding.status === "attested"` (`US-J-07` Hard Gate 3) and `scrubClaimForExport`. Generates `ChargeExport` (`837P` / `837I` / `CSV`) with X12 payload and `acknowledgment277Status: "ACCEPTED"`, updates `Claim`, and logs audit event (`capability: "charge.export"`).
- Register `codingRoutes` in `apps/api/src/routes/index.ts`.
- Create `apps/api/src/__tests__/coding.test.ts` testing PT/33 conversion, Modifier 51 multiple endoscopy reduction math, Modifier XS/59 distinct segment logic, Gate 3 blocker (409 when unreviewed or unsigned note), attestation, and 837I/837P export.

Verify with `pnpm --filter @asc/api test` and commit.

---

## Commit 6: `feat(web): enhance coding tab with PT/33, Modifier 51 reduction math, auth divergence banner, and PROGRESS.md`

### 6.1 Update `apps/web/src/features/case/tabs/coding/` & Lockstep MSW Mocks
- Update `apps/web/src/features/case/tabs/coding/charge-export-card.tsx` and `attest-card.tsx` (respecting `LM-003` hook budget):
  - Display `authDivergence` warning banner when billed CPTs diverge from pre-authorized CPTs (`US-D-08`, `US-J-05`).
  - Display `modifierPtOr33Applied` badge (`Modifier PT / 33 Screening-to-Therapeutic Conversion`) (`US-J-02`).
  - Show `baseAllowedCents`, `multipleEndoscopyReductionCents` (`Modifier 51`), and `netExpectedReimbursementCents` in the claim lines table (`US-J-03`).
- Update `apps/web/src/mocks/handlers/clinical/post-procedure.ts` and `center.ts` in lockstep (`LM-006`) so MSW uses `deriveGiCodingSuggestions`, `calculateMultipleEndoscopyReduction`, and `evaluateGate3ClaimReadiness`.
- Update `PROGRESS.md` marking `P22b` as `done`.

Verify full monorepo:
```bash
pnpm check-types && pnpm lint && pnpm test && pnpm eval && pnpm build
```
