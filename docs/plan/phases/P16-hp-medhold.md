# P16 — Pre-procedure H&P + med-hold + readiness gate

| Field | Value |
|---|---|
| Status | **done** (PR [#91](https://github.com/imRahul05/ASC-EHR/pull/91)) |
| Wave · Lane · Size | 3 · Clinical/AI · M |
| Depends on | P07, P15b |
| Unblocks | P19 (context), P22a, go-live gate |
| Source mix | MS + MP + NEW (ASGE 2022 rules, CMS 42 CFR § 416.52 H&P validity engine, Fastify routes & MSW mocks) |
| Requirements | US-E-02, US-E-03, US-F-02, US-F-04, US-F-06, AC-F-02-1, AC-F-02-2 |
| Branch | `feat/hp-medhold` |

## Goal
RN/MD dictates or types H&P; `hp_intake` agent drafts structured rows with gap-chips; med-hold rules flag anticoagulants/GLP-1/SGLT2/etc. with protocol; readiness gate blocks "Ready for procedure" until H&P current, ASA, holds confirmed, escort.

## Out of scope
Referral-document ingestion from fax/eCW (P24 feeds it later).

## File structure
```text
packages/validation/src/agents/hp-intake.ts              NEW  input (minimum necessary) + output schema
packages/validation/src/hp/{hp-sections,hold-confirmation}.ts   NEW
packages/clinical-rules/src/med-hold/{classes,protocols,evaluate}.ts  NEW  drug class → hold days (physician-approved table)
packages/clinical-rules/src/gates/ready-for-procedure.ts EDIT real rules
packages/agents/src/agents/hp-intake/{definition,input,prompt,index}.ts  NEW  (create-agent skill)
packages/agents/src/agents/hp-intake/evals/cases.ts      NEW  synthetic only
packages/agents/src/config/tasks.ts                      EDIT hp_intake task
packages/fhir/src/questionnaires/{hp,asa-airway}.ts      NEW
apps/api/src/routes/hp.ts                                NEW  POST /cases/:id/hp/draft (SSE stream, interactive)
apps/web/src/app/(clinical)/cases/[caseId]/hp/page.tsx   NEW
apps/web/src/features/hp/*                               NEW
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Schemas (agent I/O, sections, hold confirmation) | `@asc/validation` | contracts |
| T2 | Med-hold rules + readiness gate | `@asc/clinical-rules` | golden tests |
| T3 | `hp_intake` agent + evals | `@asc/agents` | agent (create-agent skill, phi-review) |
| T4 | H&P draft SSE route | `apps/api` | streams sections |
| T5 | H&P page (Record + Questionnaire + med-hold panel) | `apps/web` | flow |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | T2–T5 | — |
| T2 | T1 | T5 | T3, T4 |
| T3 | T1 | T4 | T2 |
| T4 | T3 | T5 | T2 |
| T5 | T2, T4 | — | — |

## Packages to add
None.

## Acceptance
- [x] CMS 42 CFR § 416.52 30-day H&P validity verification with pure UTC calendar day math
- [x] Mandatory day-of interval update note (<30 days) unblocking Hard Gate 1 (`POST /cases/:id/hp-update` with LOINC `11506-3`)
- [x] Role-restricted Hard Gate 1 H&P override (`attending-physician` or `medical-director` only with min 10 chars clinical reason)
- [x] ASGE 2022 anticoagulation & bleeding risk stratification engine (Warfarin, DOACs, P2Y12, Aspirin)
- [x] Prescriber instruction capture & day-of nurse verification (`POST /cases/:id/anticoagulation-verification`)
- [x] Hard Gate 1 and Hard Gate 2 evaluate anticoagulation clearance
- [x] Strict TypeScript: Zero `any` or `unknown`, 100% test coverage, MSW mock lockstep with Fastify 5
- [x] PROGRESS.md updated with PR [#91](https://github.com/imRahul05/ASC-EHR/pull/91)

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q1 | Physician-approved med-hold protocol table | T2 | Ship table with `pendingClinicalReview` flag; gate warns, not blocks, until approved |
| Q2 | H&P currency window (30 days? state rule Q13) | T2 | 30 days configurable |
| Q-MS1 | Port MindScript pre-visit prompt ideas? | T3 | Write fresh prompt using MS pattern |
