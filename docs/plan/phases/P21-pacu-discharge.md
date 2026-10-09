# P21 — PACU + discharge

| Field | Value |
|---|---|
| Wave · Lane · Size | 3 · Clinical/AI · S |
| Depends on | P11, P20 |
| Unblocks | — |
| Source mix | MP (`Observation`, `CarePlan`, `Communication`) + MS (vitals row, note-gen pattern) + NEW (Aldrete/PADSS, gate, wiring the existing `discharge-instructions` agent) |
| Requirements | M08-1…M08-6 |
| Branch | `phase/P21-pacu-discharge` |

## Goal
PACU RN records recovery vitals and Aldrete/PADSS; discharge gate enforces threshold + escort; existing `discharge-instructions` agent drafts patient instructions (with provisional recall) for RN review and print.

## File structure
```text
packages/clinical-rules/src/scoring/{aldrete,padss}.ts            NEW
packages/clinical-rules/src/gates/discharge.ts                    EDIT real rules
packages/fhir/src/questionnaires/{pacu-assessment}.ts             NEW
apps/api/src/routes/discharge.ts                                  NEW  POST /cases/:id/discharge (gate) · /instructions/draft (SSE)
apps/worker/src/jobs/discharge-pdf/*                              NEW
apps/web/src/app/(clinical)/cases/[caseId]/pacu/page.tsx          NEW
```
(`packages/agents/src/agents/discharge-instructions/*` already exists — reuse, only adjust input if needed via change-agent-prompt skill.)

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Scores + discharge gate | `@asc/clinical-rules` | tests |
| T2 | PACU form | `@asc/fhir` | Questionnaire |
| T3 | Discharge commands + PDF job | `apps/api`, `apps/worker` | endpoints/job |
| T4 | PACU page | `apps/web` | flow |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | T3 | T2 |
| T2 | — | T4 | T1, T3 |
| T3 | T1 | T4 | T2 |
| T4 | T2, T3 | — | — |

## Packages to add
None (react-pdf from P17).

## Acceptance
- [ ] Cannot discharge below threshold or without escort; override requires reason + audit
- [ ] Instructions are draft until RN approves
- [ ] `discharge.approve` uses the nonce-bound signing ceremony ([08 §5.2](../../product/08-identity-access-and-tenancy.md#52-step-up-for-high-risk-actions), [#58](https://github.com/imRahul05/ASC-EHR/issues/58)); `agent` and `service` principals can never approve (test)
- [ ] Any discharge prescription for a controlled substance goes through a certified e-prescribing vendor (DEA 21 CFR 1311, [#58](https://github.com/imRahul05/ASC-EHR/issues/58)); this product does not build EPCS
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q1 | Aldrete vs PADSS (or both) per facility policy | T1 | Both, facility picks |
| Q14 | Instruction languages | T3 | English P1 |
