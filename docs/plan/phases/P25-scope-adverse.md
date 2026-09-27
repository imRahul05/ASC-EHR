# P25 — Scope reprocessing log + adverse events

| Field | Value |
|---|---|
| Wave · Lane · Size | 3 · Clinical · S |
| Depends on | P11, P12 |
| Unblocks | Accreditation readiness |
| Source mix | MP (`Device`, `Procedure` reprocess cycle, `AdverseEvent`, `Questionnaire`, `Task`) + NEW |
| Requirements | X1, X2 |
| Branch | `phase/P25-scope-adverse` |

## Goal
Techs log each scope's HLD/AER cycle and link scope → case; traceability report answers "which patients had scope X between dates". Staff file adverse-event reports that create a review Task.

## File structure
```text
packages/fhir/src/builders/{device,reprocess-cycle,adverse-event}.ts   NEW
packages/fhir/src/questionnaires/adverse-event.ts                      NEW
packages/validation/src/{scope-log,adverse-event}.ts                   NEW
apps/api/src/routes/scope-log.ts                                       NEW  log + traceability query
apps/web/src/app/(admin)/{scope-log,adverse-events}/page.tsx           NEW
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Builders + form + schemas | `@asc/fhir`, `@asc/validation` | contracts |
| T2 | API (log, report) | `apps/api` | endpoints |
| T3 | Pages | `apps/web` | flows |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | T2, T3 | — |
| T2 | T1 | T3 | — |
| T3 | T1, T2 | — | — |

## Packages to add
None.

## Acceptance
- [ ] Traceability report by scope serial + date range
- [ ] Case cannot record a scope without a valid recent reprocess cycle (warn P1)
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q2 | AER model / data export? | automation | Manual log P1 |
