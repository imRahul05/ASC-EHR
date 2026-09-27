# P16 — Pre-procedure H&P + med-hold + readiness gate

| Field | Value |
|---|---|
| Wave · Lane · Size | 3 · Clinical/AI · M |
| Depends on | P11, P13, P10, P07 |
| Unblocks | P19 (context), go-live gate |
| Source mix | MS (pre-visit brief, chart-review "facts with sources", meds/allergy rows, Record editors) + MP (Questionnaire, AllergyIntolerance, MedicationStatement, extraction Bot) + NEW (`hp_intake` agent, med-hold rules, gate) |
| Requirements | M03-1…M03-8; 04 §4.4 |
| Branch | `phase/P16-hp-medhold` |

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
- [ ] Every AI row is draft until confirmed; confirmed rows carry Provenance (user + agentExecutionId)
- [ ] Med-hold table reviewed by a physician (link recorded in PROGRESS)
- [ ] Gate blocks transition with named reasons (API authoritative, UI instant)
- [ ] phi-review skill clean; evals green
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q1 | Physician-approved med-hold protocol table | T2 | Ship table with `pendingClinicalReview` flag; gate warns, not blocks, until approved |
| Q2 | H&P currency window (30 days? state rule Q13) | T2 | 30 days configurable |
| Q-MS1 | Port MindScript pre-visit prompt ideas? | T3 | Write fresh prompt using MS pattern |
