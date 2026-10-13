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
- [x] Booking with a conflicting room/provider is blocked naming the conflict (`ROOM_DOUBLE_BOOKED`, `PHYSICIAN_DOUBLE_BOOKED`, `ANESTHESIA_DOUBLE_BOOKED`) (P15a)
- [ ] Phase change reflects on board ≤ 2 s (P15b)
- [ ] Cancelled/no-show renders muted and creates `cancelled-followup` Task (P12 bot / P15b)
- [x] Booking a patient at a facility not yet in the Patient's `meta.accounts` adds it through the `$set-accounts` flow, preserving existing accounts in fallback and auditing `patient facility added` ([#59](https://github.com/imRahul05/ASC-EHR/issues/59)) (P15a)
- [x] PROGRESS.md updated (P15a)

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q-MS3 | MindScript resource grid exists? | T4 | Build on Base UI + virtual rows |
| Q1 | Whiteboard PHI display (full name vs initials) | T4 | Initials + case # (visible to public areas) |
| Q6 | Rooms/cases per day | T4 sizing | 4 rooms × 30 (~120 cases/day; search query _count set to 250) |

## P15a Decisions & Architecture (recorded 2026-10-13, PR #78)

ADR: [`docs/decisions/2026-10-13-case-booking-and-pure-scheduling-conflict-engine.md`](../../decisions/2026-10-13-case-booking-and-pure-scheduling-conflict-engine.md)

1. **Sub-phase Split (LM-015 / PROGRESS.md)**:
   - **P15a**: Case Booking Contracts, Pure Conflict Engine & Fastify Booking API (PR [#78](https://github.com/imRahul05/ASC-EHR/pull/78)).
   - **P15b**: Scheduling & Whiteboard UI (Components, Resource Calendar & Real-Time Board).

2. **Pure Scheduling Conflict Engine (`@asc/clinical-rules`)**:
   - Implemented as a zero-dependency pure function: `evaluateScheduleConflict(candidateCase, existingCases): RuleResult`.
   - **Half-Open Interval Check**: Evaluates overlap as:
     $$\text{candidate.startMs} < \text{existing.endMs} \quad \land \quad \text{candidate.endMs} > \text{existing.startMs}$$
     Adjacent slots (e.g. 09:00–09:45 and 09:45–10:30) do NOT overlap.
   - **Conflict Codes**: Returns specific, localized rule failure reasons:
     - `ROOM_DOUBLE_BOOKED` ("Operating room is already occupied during this time window")
     - `PHYSICIAN_DOUBLE_BOOKED` ("Physician has another procedure scheduled during this time window")
     - `ANESTHESIA_DOUBLE_BOOKED` ("Anesthesia provider is booked in another room during this time window")
   - **Status Exclusions**: Automatically excludes cancelled and no-show appointments:
     - `"cancelled"`
     - `"no_show"`, `"no-show"`, and normative FHIR R4 `"noshow"`
     - Normative FHIR R4 `"entered-in-error"`
   - **Safe End Time Fallback**: If an existing slot lacks an explicit `endMs` or has a malformed timestamp (`endMs <= startMs`), the engine safely falls back to $\text{startMs} + \text{durationMinutes} \times 60 \times 1000$ rather than evaluating $0$ and silently bypassing conflicts.

3. **Atomic Booking FHIR Transaction Bundle (`apps/api`)**:
   - Prevents partial failure states by committing all three required clinical resources in a single atomic transaction bundle:
     - `Appointment`: `status: "booked"`, `start`, `end`, participants (`Patient`, `Location/roomId`, `Practitioner/primaryPhysicianId` with `PPRF` code, optional `Practitioner/anesthesiologistId` with `SPRF` code).
     - `Encounter`: `status: "planned"`, `stage: "scheduled"`, linking to relative `urn:uuid:appointment`.
     - `ServiceRequest`: `status: "active"`, `intent: "order"`, capturing clinical `procedureIntent` (screening, surveillance, diagnostic, therapeutic) and CPT codes, linking to relative `urn:uuid:encounter`.
   - Executed through `forFacility(request.medplum, facilityId).transaction(bundle)`.
   - Asserted that returned transaction IDs (`appointmentId`, `encounterId`) are non-empty and well-formed; fails fast with an explicit error if missing.

4. **Schema Boundary Validation (`@asc/validation`)**:
   - `bookCaseSchema` enforces:
     - Canonical `FHIR_ID` regex (`/^[A-Za-z0-9.-]{1,64}$/`) on `facilityId`, `patientId`, `roomId`, `primaryPhysicianId`, and optional `anesthesiologistId` (LM-026).
     - Valid future ISO 8601 instant with timezone on `scheduledAt`.
     - Integer procedure duration bounded between 15 and 240 minutes (default 45).
     - `procedureIntent` enum: `screening`, `surveillance`, `diagnostic`, `therapeutic`.
     - Notes sanitization: empty or whitespace strings (`""` or `"   "`) are transformed to `undefined`.

5. **Narrative Text vs Constrained Text (`@asc/fhir`)**:
   - Standard `text()` in FHIR builders rejects all control characters (`/\p{Cc}/u`), which throws on `\n` or `\r`.
   - Introduced `narrativeText()` in `@asc/fhir/builders/common.ts` allowing standard multiline whitespace (`\n`, `\r`, `\t`) for clinical notes and appointment descriptions while continuing to reject unsafe control characters (`\x00`, `\x1b`).

6. **Daily Schedule Sizing & Facility Scoping**:
   - Daily appointment queries specify `_count: "250"` to ensure full schedule coverage in busy facilities with 4–6 procedure suites running up to ~120 cases/day.
   - When checking patient facility association, if `$set-accounts` fails, the fallback update merges `updatedAccounts` with all existing accounts, preserving cross-facility associations rather than truncating them.

7. **Structured PHI Hygiene in Logs**:
   - Fastify structured audit logs record only non-PHI identifiers (`facilityId`, `patientId`, `caseId`, `appointmentId`, `encounterId`, `roomId`, `scheduledAt`). Patient demographics, names, and procedure notes are strictly omitted.

