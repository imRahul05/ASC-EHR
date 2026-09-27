# P20 — AIMS anesthesia flowsheet (offline-safe)

| Field | Value |
|---|---|
| Wave · Lane · Size | 3 · Clinical · M (critical: highest liability) |
| Depends on | P15, P09 (P10 optional) |
| Unblocks | P21, P26 |
| Source mix | MP (`Observation` series, `MedicationAdministration`, `Procedure`) + NEW (flowsheet grid, offline queue) — MindScript has no time-series |
| Requirements | M07-1…M07-8; offline tolerance NFR |
| Branch | `phase/P20-aims-flowsheet` |

## Goal
Anesthesia provider charts vitals at required intervals, drugs/doses, sedation scores and anesthesia start/end on a fast grid; entries queue locally when network drops and sync without loss or duplicates.

## Out of scope
Monitor HL7 auto-feed (P1.5).

## File structure
```text
packages/validation/src/aims/{vital-entry,drug-entry,anesthesia-times}.ts   NEW
packages/clinical-rules/src/aims/{intervals,sedation-scores,anesthesia-time}.ts NEW
packages/fhir/src/terminology/codesystems/anesthesia-drug-library.ts        NEW
packages/api-client/src/offline/queue.ts                                     NEW  Dexie store, idempotency keys, replay with backoff
packages/ui/src/components/flowsheet/{flowsheet-grid,vital-cell,drug-row,time-axis}.tsx  NEW  virtualised, keyboard-first
apps/api/src/routes/aims.ts                                                  NEW  POST /cases/:id/aims/batch (idempotent)
apps/web/src/app/(clinical)/cases/[caseId]/anesthesia/page.tsx               NEW
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | AIMS schemas + drug library | `@asc/validation`, `@asc/fhir` | contracts |
| T2 | Interval/score/time rules | `@asc/clinical-rules` | tests |
| T3 | Offline queue | `@asc/api-client` | queue + tests (fake IndexedDB) |
| T4 | Idempotent batch endpoint | `apps/api` | endpoint |
| T5 | Flowsheet components | `@asc/ui` | grid |
| T6 | Anesthesia page | `apps/web` | e2e incl. offline toggle |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | all | — |
| T2 | T1 | T6 | T3–T5 |
| T3 | T1 | T6 | T2, T4, T5 |
| T4 | T1 | T6 | T2, T3, T5 |
| T5 | T1 | T6 | T2–T4 |
| T6 | T2–T5 | P21 | — |

## Packages to add
| Package | Version | Workspace |
|---|---|---|
| `dexie` | 4.4.6 | `@asc/api-client` |
| `fake-indexeddb` | latest | `@asc/api-client` (dev) |

## Acceptance
- [ ] Kill network mid-case → entries persist locally → reconnect → all synced once
- [ ] Offline store encrypted at rest (WebCrypto key held in memory, cleared on logout) — see Q1
- [ ] Anesthesia provider sign-off in weekly review (05 risk)
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q3 | Anesthesia model (MAC/CRNA/moderate) | T2 | Support both; intervals configurable |
| Q1 | PHI in IndexedDB acceptable with encryption + short TTL? (compliance) | T3 | Yes: encrypted, purged on sync + logout; needs COMPLIANCE doc note |
