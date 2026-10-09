# P15 — Scheduling, case booking, whiteboard

| Field | Value |
|---|---|
| Wave · Lane · Size | 3 · Clinical · M (split P15a booking / P15b whiteboard if > 3 days) |
| Depends on | P14, P07, P10 |
| Unblocks | P17, P18, P20 |
| Source mix | MP (`Appointment`, `Slot`, `Schedule`, `Location`, Subscriptions) + MS (calendar UI if Q-MS3 yes; muted cancelled rows) + NEW (conflicts, state machine, whiteboard) |
| Requirements | M01-1…M01-8 |
| Branch | `phase/P15-scheduling-whiteboard` |

## Goal
Scheduler books a case (room, time, physician, anesthesia, intent screening/surveillance/diagnostic) with conflict blocking; case phase advances via commands; whiteboard TV shows all rooms live (≤ 2 s).

## Out of scope
Block-template editor UI (admin via Medplum App in P1), utilization analytics (P3).

## File structure
```text
packages/validation/src/cases/{book,transition}.ts         NEW
packages/clinical-rules/src/scheduling/conflicts.ts        NEW  room/provider/anesthesia overlap
packages/fhir/src/builders/{appointment,encounter,service-request}.ts  EDIT intent on ServiceRequest
apps/api/src/routes/cases.ts                               NEW  POST /cases (book), POST /cases/:id/transition
apps/api/src/services/case-commands.ts                     NEW  transaction bundle: Appointment+Encounter+ServiceRequest+Provenance
packages/ui/src/components/calendar/{resource-calendar,case-card,room-column}.tsx  NEW (port if MS grid exists)
packages/ui/src/components/clinical/whiteboard-tile.tsx    NEW  large-type, colour by phase, no PHI beyond initials policy (Q1)
apps/web/src/app/(clinical)/schedule/page.tsx              NEW
apps/web/src/app/(clinical)/board/page.tsx                 NEW  kiosk mode, Medplum useSubscription
apps/web/src/features/scheduling/*                         NEW
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Book/transition schemas + builders | `@asc/validation`, `@asc/fhir` | contracts |
| T2 | Conflict rules (+ reuse P07 machine) | `@asc/clinical-rules` | tests |
| T3 | Case commands | `apps/api` | endpoints + tests |
| T4 | Calendar + whiteboard components | `@asc/ui` | components |
| T5 | Schedule + board pages | `apps/web` | e2e book → board updates |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | T2–T5 | — |
| T2 | T1 | T3 | T4 |
| T3 | T2 | T5 | T4 |
| T4 | T1 | T5 | T2, T3 |
| T5 | T3, T4 | P17, P18, P20 | — |

## Packages to add
None (date-fns from P07).

## Acceptance
- [ ] Booking with a conflicting room/provider is blocked naming the conflict (M01 AC)
- [ ] Phase change reflects on board ≤ 2 s
- [ ] Cancelled/no-show renders muted and creates `cancelled-followup` Task (P12 bot)
- [ ] Booking a patient at a facility not yet in the Patient's `meta.accounts` adds it through the same `$set-accounts` flow as P14, following the tenant's `patientRecordSharing` setting and audited as `patient.facility_added` ([#59](https://github.com/imRahul05/ASC-EHR/issues/59))
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q-MS3 | MindScript resource grid exists? | T4 | Build on Base UI + virtual rows |
| Q1 | Whiteboard PHI display (full name vs initials) | T4 | Initials + case # (visible to public areas) |
| Q6 | Rooms/cases per day | T4 sizing | 4 rooms × 30 |
