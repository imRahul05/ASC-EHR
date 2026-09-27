# P23 — Pathology loop + requisition + result letters

| Field | Value |
|---|---|
| Wave · Lane · Size | 3 · Clinical/AI · M |
| Depends on | P18, P12 |
| Unblocks | P2 quality (ADR) |
| Source mix | MP (`Specimen`, `ServiceRequest`, `DiagnosticReport`, `Task`, Bots, PDF) + MS (worklist pattern, guideline advisor for surveillance) + NEW (reconcile, letters) |
| Requirements | M10-1…M10-6; X3 (letters) |
| Branch | `phase/P23-pathology-loop` |

## Goal
Requisition PDF per case; `specimen-outstanding` Tasks until result; histology result entered/received → reconciled to the polyp finding by `pathology_reconcile` (draft) → MD confirms → surveillance interval + result letters to patient and referrer.

## File structure
```text
packages/clinical-rules/src/pathology/{overdue,reconcile-match}.ts        NEW
packages/validation/src/pathology/*.ts · agents/{pathology-reconcile,referral-letter}.ts  NEW
packages/agents/src/agents/{pathology-reconcile,referral-letter}/*        NEW
apps/bots/src/task-specimen-outstanding.ts                                NEW  create on Specimen, resolve on DiagnosticReport
apps/worker/src/jobs/{requisition-pdf,letters}/*                          NEW
apps/api/src/routes/pathology.ts                                          NEW
apps/web/src/app/(clinical)/cases/[caseId]/pathology/page.tsx             NEW
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Schemas + rules | `@asc/validation`, `@asc/clinical-rules` | contracts + tests |
| T2 | Agents + evals | `@asc/agents` | 2 agents |
| T3 | Bot | `apps/bots` | task automation |
| T4 | PDF/letter jobs | `apps/worker` | jobs |
| T5 | API + page | `apps/api`, `apps/web` | flow |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | all | — |
| T2 | T1 | T4 | T3 |
| T3 | T1 | T5 | T2, T4 |
| T4 | T2 | T5 | T3 |
| T5 | T3, T4 | — | — |

## Packages to add
None.

## Acceptance
- [ ] Every specimen has a Task until resulted; overdue alerts per rule
- [ ] Reconcile is draft until MD confirms
- [ ] Letters routed: patient (print/portal later), referrer (fax via P24 or eFax bot)
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q12 | Lab + interface | result intake | Manual entry + PDF upload P1 |
| Q-MS10 | Licence for verbatim guideline text | surveillance | Cite guideline IDs only |
