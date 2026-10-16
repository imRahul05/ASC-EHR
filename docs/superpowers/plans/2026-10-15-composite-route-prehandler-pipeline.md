# Composite Route Pre-Handler Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a centralized, type-safe composite route pre-handler pipeline factory (`createClinicalMutationPipeline` and `createClinicalQueryPipeline`) in Fastify to eliminate hook ordering fragility, guarantee strict security sequencing (Gates 3 & 4 capability verification -> Idempotency replay -> Case hydration -> Zod schema validation), and refactor all case mutation/query routes across `apps/api`.

**Architecture:** Fastify route definitions currently configure raw arrays of hooks (`requireCapabilityHook`, `requireIdempotency`, `requireCaseContext`, `validateBody`), leading to subtle hook ordering discrepancies (e.g. idempotency executing before authorization or body validation executing before case hydration). The composite pipeline encapsulates the canonical, tamper-proof execution sequence into reusable factory functions with strict TypeScript generic type inference and zero `any`/`unknown` types.

**Tech Stack:** Fastify 5.3, TypeScript 7.0, Zod 3.25, Vitest, Turborepo.

**Spec:** GitHub Issue #99 (`refactor(api): Create Composite Route Pre-Handler Pipeline to Eliminate Hook Ordering Fragility`) and `LEARNING_MISTAKES.md` (LM-034, LM-035, LM-036).

## Global Constraints

- **Strict Type Safety**: Absolute ban on `any` and `unknown` under all circumstances (`<RULE[user_global]>`).
- **Zero Lint Warnings**: `eslint --max-warnings 0` must pass after every task.
- **Fail-Closed Security**: `requireCapabilityHook` must strictly execute BEFORE `requireIdempotency` and `requireCaseContext` to prevent unauthorized resource enumeration or cache pollution.
- **Fail-Closed Facility Guard**: Idempotency cache replays must ensure `request.facilityChecked = true` is set so the Fastify `onSend` guard does not trigger HTTP 500.
- **Atomic Commits**: <= 400 changed lines per commit, green test suite after every step.

## Review Focus

1. **Unauthorized Caller Probing (HIPAA Security Rule)**: When an unauthorized user calls `POST /cases/:id/transition`, the pipeline MUST reject with 403 `FORBIDDEN` before attempting Medplum encounter lookup (`requireCaseContext`), preventing case existence enumeration.
2. **Idempotency Replay on Resource Routes**: When a cached response is returned by `requireIdempotency`, the request must short-circuit with 200 OK without executing downstream hooks or failing the `facilityChecked` onSend guard.
3. **ETag Version Mismatch (`If-Match`)**: When `enforceIfMatch: true`, missing or mismatched `If-Match` headers must reject immediately with 400/409 before executing business logic.
4. **Invalid Schema Rejection**: When an invalid payload is sent, `validateBody` must return 400 `INVALID_PAYLOAD` with formatted issues without reaching the controller.
5. **Non-Existent Case Context**: If `caseId` is not found, `requireCaseContext` must return 404 `NOT_FOUND` before payload processing.

---

### Task 1: Pipeline Factory (`apps/api/src/hooks/pipeline.ts`) and Comprehensive Unit Test Suite

**Files:**
- Create: `apps/api/src/hooks/pipeline.ts`
- Test: `apps/api/src/hooks/pipeline.test.ts`
- Modify: `apps/api/src/hooks/index.ts` (export pipeline factories)

**Interfaces:**
- Consumes:
  - `requireCapabilityHook(capability: Capability)` from `apps/api/src/hooks/case-context.js`
  - `requireCaseContext` from `apps/api/src/hooks/case-context.js`
  - `requireIdempotency` from `apps/api/src/hooks/idempotency.js`
  - `validateBody`, `validateQuery` from `apps/api/src/hooks/validation.js`
  - `API_ERROR_CODES`, `type Capability` from `@asc/types`
- Produces:
  - `createClinicalMutationPipeline<TOutput, TDef, TInput>(options: ClinicalMutationPipelineOptions<TOutput, TDef, TInput>): readonly PipelineHook[]`
  - `createClinicalQueryPipeline<TOutput, TDef, TInput>(options: ClinicalQueryPipelineOptions<TOutput, TDef, TInput>): readonly PipelineHook[]`

- [ ] **Step 1: Write the failing unit tests for pipeline factory in `apps/api/src/hooks/pipeline.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { API_ERROR_CODES } from "@asc/types";
import { registerErrorHandler } from "../plugins/error-handler.js";
import {
  createClinicalMutationPipeline,
  createClinicalQueryPipeline,
} from "./pipeline.js";

const testSchema = z.object({
  action: z.string().min(1),
  count: z.number().int().positive(),
});

describe("Composite Route Pre-Handler Pipeline", () => {
  it("executes hooks in canonical sequence on valid request", async () => {
    // Verifies capability -> idempotency -> caseContext -> validateBody -> controller
  });

  it("halts with 403 Forbidden before caseContext when capability check fails", async () => {
    // Verifies unauthorized caller is rejected without querying case
  });

  it("halts with 400 Bad Request when enforceIfMatch is true and If-Match header is missing", async () => {
    // Verifies ETag enforcement option
  });

  it("halts with 400 Invalid Payload when body schema fails validation", async () => {
    // Verifies schema validation error format
  });

  it("allows disabling idempotency via enableIdempotency: false", async () => {
    // Verifies opt-out option
  });

  it("createClinicalQueryPipeline executes capability -> caseContext -> validateQuery", async () => {
    // Verifies query pipeline execution
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api test src/hooks/pipeline.test.ts`
Expected: FAIL with `Cannot find module './pipeline.js'`

- [ ] **Step 3: Implement `createClinicalMutationPipeline` and `createClinicalQueryPipeline` in `apps/api/src/hooks/pipeline.ts`**

Implement options interfaces and pipeline functions:
- `ClinicalMutationPipelineOptions<TOutput, TDef, TInput>`:
  - `capability: Capability`
  - `schema?: ZodType<TOutput, TDef, TInput>`
  - `errorMessage?: string`
  - `enableIdempotency?: boolean` (default: `true`)
  - `enforceIfMatch?: boolean` (default: `false`)
- `ClinicalQueryPipelineOptions<TOutput, TDef, TInput>`:
  - `capability: Capability`
  - `querySchema?: ZodType<TOutput, TDef, TInput>`
  - `errorMessage?: string`
- Sequence order for mutations:
  1. `requireCapabilityHook(options.capability)`
  2. `requireIdempotency` (if `enableIdempotency !== false`)
  3. `requireIfMatch` check (if `enforceIfMatch === true`)
  4. `requireCaseContext`
  5. `validateBody(options.schema, options.errorMessage)` (if `schema` present)
- Sequence order for queries:
  1. `requireCapabilityHook(options.capability)`
  2. `requireCaseContext`
  3. `validateQuery(options.querySchema, options.errorMessage)` (if `querySchema` present)
- Export from `apps/api/src/hooks/index.ts`.

- [ ] **Step 4: Run pipeline unit tests to verify they pass**

Run: `pnpm --filter api test src/hooks/pipeline.test.ts`
Expected: PASS (all tests pass)

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/api/src/hooks/pipeline.ts apps/api/src/hooks/pipeline.test.ts apps/api/src/hooks/index.ts
git commit -m "feat(api): implement composite route pre-handler pipeline factory (Issue #99)"
```

---

### Task 2: Refactor Clinical Mutation and Query Routes to Consume Pipeline

**Files:**
- Modify: `apps/api/src/routes/cases.ts`
- Modify: `apps/api/src/routes/consent.ts`
- Modify: `apps/api/src/routes/financial.ts`
- Modify: `apps/api/src/routes/hp.ts`
- Modify: `apps/api/src/routes/preop.ts`

**Interfaces:**
- Consumes:
  - `createClinicalMutationPipeline`, `createClinicalQueryPipeline` from `../hooks/pipeline.js`
  - Schemas from `@asc/validation`
- Produces:
  - Cleaner, unified route definitions with zero raw hook arrays across all 5 clinical domain route files.

- [ ] **Step 1: Refactor `apps/api/src/routes/cases.ts`**
  - Replace raw preHandler arrays on `GET /cases/:caseId` with `createClinicalQueryPipeline({ capability: "case.read" })`.
  - Replace raw preHandler arrays on `POST /cases/:caseId/transition` with `createClinicalMutationPipeline({ capability: "case.advance", schema: transitionCaseSchema, errorMessage: "Invalid case transition payload" })`.
  - Verify existing tests pass: `pnpm --filter api test src/routes/cases.test.ts src/routes/cases-detail.test.ts src/routes/cases-lock.test.ts`.

- [ ] **Step 2: Refactor `apps/api/src/routes/consent.ts`**
  - Replace raw preHandler arrays on `POST /cases/:caseId/consent` with `createClinicalMutationPipeline({ capability: "consent.collect", schema: signConsentSchema, errorMessage: "Invalid consent payload." })`.
  - Replace raw preHandler arrays on `GET /cases/:caseId/consent` with `createClinicalQueryPipeline({ capability: "case.read" })`.
  - Verify existing tests pass: `pnpm --filter api test src/routes/consent.test.ts`.

- [ ] **Step 3: Refactor `apps/api/src/routes/financial.ts`**
  - Replace raw preHandler arrays on `GET /cases/:caseId/financial-summary` with `createClinicalQueryPipeline({ capability: "case.read" })`.
  - Replace raw preHandler arrays on `POST /cases/:caseId/copay-collected` with `createClinicalMutationPipeline({ capability: "patient.register" })`.
  - Replace raw preHandler arrays on `POST /cases/:caseId/prior-auth` with `createClinicalMutationPipeline({ capability: "patient.eligibility.check" })`.
  - Verify existing tests pass: `pnpm --filter api test src/routes/financial-clearance.test.ts`.

- [ ] **Step 4: Refactor `apps/api/src/routes/hp.ts`**
  - Replace raw preHandler arrays on `POST /cases/:caseId/hp-update` with `createClinicalMutationPipeline({ capability: "procedure.document", schema: hpUpdateNoteSchema })`.
  - Replace raw preHandler arrays on `POST /cases/:caseId/hp-override` with `createClinicalMutationPipeline({ capability: "case.advance", schema: hpOverrideSchema })`.
  - Replace raw preHandler arrays on `POST /cases/:caseId/anticoagulation` with `createClinicalMutationPipeline({ capability: "procedure.document", schema: anticoagulationAssessmentSchema })`.
  - Replace raw preHandler arrays on `GET /cases/:caseId/hp-summary` with `createClinicalQueryPipeline({ capability: "case.read" })`.
  - Verify existing tests pass: `pnpm --filter api test src/routes/hp.test.ts src/routes/anticoagulation.test.ts`.

- [ ] **Step 5: Refactor `apps/api/src/routes/preop.ts`**
  - Replace raw preHandler arrays on `POST /cases/:caseId/preop-assessment` with `createClinicalMutationPipeline({ capability: "procedure.document", schema: preopAssessmentSchema, errorMessage: "Invalid pre-op assessment payload." })`.
  - Verify existing tests pass: `pnpm --filter api test src/routes/preop.test.ts`.

- [ ] **Step 6: Run all API tests together**

Run: `pnpm --filter api test`
Expected: PASS (all 34 test files pass)

- [ ] **Step 7: Commit Task 2**

```bash
git add apps/api/src/routes/cases.ts apps/api/src/routes/consent.ts apps/api/src/routes/financial.ts apps/api/src/routes/hp.ts apps/api/src/routes/preop.ts
git commit -m "refactor(api): migrate clinical routes to composite pre-handler pipeline (Issue #99)"
```

---

### Task 3: Quality Gates Verification, Documentation & Learning Updates

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `PROGRESS.md`
- Modify: `LEARNING_MISTAKES.md`

**Interfaces:**
- Consumes: Completed Task 1 and Task 2 implementations
- Produces: Updated architecture guidelines, progress documentation, and verified clean build

- [ ] **Step 1: Document Composite Route Pipeline Pattern in `docs/ARCHITECTURE.md`**
  - Add section "Composite Route Pre-Handler Pipelines" detailing the standard 5-step sequence.
  - Provide an example of creating new clinical endpoints using `createClinicalMutationPipeline`.

- [ ] **Step 2: Update `PROGRESS.md` and `LEARNING_MISTAKES.md`**
  - Record completion of Issue #99 in `PROGRESS.md`.
  - Update `LEARNING_MISTAKES.md` if any edge case was discovered during route migration.

- [ ] **Step 3: Run Full Workspace Verification**

```bash
pnpm turbo run lint check-types test build
```
Expected: All tasks succeed with 0 lint errors, 0 type errors, 0 test failures.

- [ ] **Step 4: Commit Task 3**

```bash
git add docs/ARCHITECTURE.md PROGRESS.md LEARNING_MISTAKES.md
git commit -m "docs(api): document composite route pipeline and mark Issue #99 complete"
```
