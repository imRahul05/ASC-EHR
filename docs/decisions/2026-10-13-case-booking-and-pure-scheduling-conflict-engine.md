# Case Booking Architecture and Pure Scheduling Conflict Engine

- **Status**: accepted
- **Date**: 2026-10-13
- **Deciders**: Engineering Team
- **Consulted**: AGENTS.md, docs/plan/phases/P15-scheduling-whiteboard.md, docs/product/03-target-architecture.md
- **PR**: [#78](https://github.com/imRahul05/ASC-EHR/pull/78) (Phase P15a)

---

## Context

In an Ambulatory Surgery Center (ASC) specializing in endoscopy and outpatient procedures, scheduling procedures requires coordinating multiple constrained resources simultaneously:
1. **Operating Rooms / Procedure Suites** (e.g., OR 1 through OR 4).
2. **Primary Physicians / Endoscopists** (e.g., gastroenterologists, colorectal surgeons).
3. **Anesthesia Providers** (e.g., CRNAs, anesthesiologists).

Scheduling errors (such as double-booking a room, a physician, or an anesthesia provider) cause acute clinical disruptions, room idle time, patient dissatisfaction, and regulatory safety concerns.

Furthermore, booking a surgical case in FHIR R4 is not a single-resource operation; it establishes:
- An `Appointment` (booked slot with start/end timestamps and assigned participants).
- An `Encounter` (the clinical encounter record initialized to status `planned` and stage `scheduled`).
- A `ServiceRequest` (the clinical order detailing procedure intent — screening, surveillance, diagnostic, therapeutic — and primary/secondary CPT/HCPCS codes).

We evaluated how conflict detection and booking should be implemented across the monorepo architecture.

---

## Decision

We adopt:
1. **A pure, deterministic scheduling conflict engine (`evaluateScheduleConflict`) in `@asc/clinical-rules` with zero database or I/O dependencies.**
2. **Atomic multi-resource writes using a single FHIR `transaction` bundle via `forFacility(client, facilityId).transaction(bundle)` in `apps/api`.**
3. **Strict schema boundary validation in `@asc/validation` and safe multiline narrative text handling in `@asc/fhir`.**

---

## Detailed Design & Principles

### 1. Pure In-Memory Conflict Engine (`@asc/clinical-rules`)

Rather than executing complex, vendor-specific database queries or sequential FHIR searches to detect room or provider conflicts, we separate I/O from clinical business logic:
- The API route queries the facility's appointments for the target date (`searchResources("Appointment", { date, _account, _count: "250" })`).
- The appointments are mapped to a pure data structure:
  ```ts
  export interface ScheduleSlot {
    readonly id?: string;
    readonly roomId: string;
    readonly startMs: number;
    readonly durationMinutes: number;
    readonly endMs?: number;
    readonly primaryPhysicianId: string;
    readonly anesthesiologistId?: string;
    readonly status?: string;
  }
  ```
- The pure function `evaluateScheduleConflict(candidateCase, existingCases): RuleResult` executes in memory:
  - **Half-Open Interval Check**: Two slots overlap if and only if:
    $$\text{candidate.startMs} < \text{existing.endMs} \quad \land \quad \text{candidate.endMs} > \text{existing.startMs}$$
    Adjacent cases (e.g., 09:00–09:45 and 09:45–10:30) do NOT overlap.
  - **Safe End Time Fallback**: If an existing slot lacks an explicit `endMs` or has a malformed timestamp (`endMs <= startMs`), the engine safely falls back to $\text{startMs} + \text{durationMinutes} \times 60 \times 1000$ rather than evaluating $0$ and bypassing conflicts.
  - **Exclusion of Inactive Slots**: Slots marked with terminal or stopped statuses are excluded from conflict calculations:
    - `"cancelled"`
    - `"no_show"`, `"no-show"`, and normative FHIR R4 `"noshow"`
    - Normative FHIR R4 `"entered-in-error"`
  - **Granular Conflict Reasons**: Returns deterministic failure codes:
    - `ROOM_DOUBLE_BOOKED` ("Operating room is already occupied during this time window")
    - `PHYSICIAN_DOUBLE_BOOKED` ("Physician has another procedure scheduled during this time window")
    - `ANESTHESIA_DOUBLE_BOOKED` ("Anesthesia provider is booked in another room during this time window")

**Benefits:**
- 100% testable via fast, deterministic golden unit tests without requiring a running database or Medplum instance.
- Reusable on the client side (e.g. real-time drag-and-drop feedback on whiteboard or calendar UI in Phase P15b) without duplicating conflict evaluation logic.

### 2. Atomic FHIR Transaction Bundle Writes (`apps/api`)

Sequential writes (creating `Appointment`, then `Encounter`, then `ServiceRequest`) create catastrophic partial failure modes where an orphaned appointment exists without an encounter or procedure order.

We mandate:
- All three resources are assembled in a single FHIR `transaction` bundle (`createTransaction({ facilityId })`).
- Relative URN references (`urn:uuid:appointment`, `urn:uuid:encounter`) link the resources within the transaction.
- The bundle is executed atomically through `forFacility(request.medplum, facilityId).transaction(bundle)`, guaranteeing all three resources commit together or roll back cleanly.
- Returned transaction response IDs are asserted; if either `appointmentId` or `encounterId` cannot be resolved from the response bundle, the route fails fast with an explicit error.

### 3. Boundary Validation & Multiline Narrative Text

- **FHIR ID Regex on `roomId`**: In accordance with `LM-026`, room IDs must conform to canonical FHIR ID regex (`/^[A-Za-z0-9.-]{1,64}$/`) at the Zod schema boundary so invalid room identifiers fail fast with HTTP 400 rather than crashing inside FHIR reference builders.
- **Notes Sanitization**: Empty or whitespace strings (`""` or `"   "`) are transformed to `undefined` in `bookCaseSchema`.
- **`narrativeText()` in `@asc/fhir`**: Standard `text(v)` in FHIR builders rejects all Unicode control characters (`/\p{Cc}/u`), which throws on `\n` or `\r`. For clinical notes and appointment descriptions, `narrativeText()` permits standard multiline whitespace (`\n`, `\r`, `\t`) while continuing to reject dangerous control characters (`\x00`, `\x1b`).

### 4. Multi-Tenant Facility Scoping & High-Volume Search

- **Query Sizing**: Daily appointment queries specify `_count: "250"`, guaranteeing that busy ASCs operating 4–6 procedure suites with fast turnover (up to 120+ procedures/day) do not suffer from missed conflicts due to pagination cutoffs.
- **Facility Stamping**: Every resource created stamps `meta.accounts: [{ reference: "Organization/<facilityId>" }]`.
- **Fallback Account Preservation**: When checking patient facility association, if `$set-accounts` fails, the fallback update merges `updatedAccounts` with all existing accounts, preserving cross-facility associations rather than truncating them.

### 5. PHI Hygiene in Audit Logs

Per `COMPLIANCE_AND_PHI.md` and `LM-018`:
- Audit logs record only opaque identifiers (`facilityId`, `patientId`, `caseId`, `appointmentId`, `encounterId`, `roomId`, `scheduledAt`).
- Patient names, dates of birth, clinical indications, and notes are strictly excluded from server log payloads.

---

## Consequences

### Positive
- Zero risk of orphaned scheduling resources on booking failure.
- Instant, deterministic conflict checks with zero database load during pure evaluation.
- Identical conflict detection engine can be imported directly by browser components in Phase P15b.
- Full compliance with HIPAA PHI logging rules and multi-facility tenant boundaries.

### Negative / Trade-offs
- The server must fetch all daily appointments for the facility into memory before evaluating conflicts (mitigated by setting `_count: "250"` and indexing on `date` and `_account`).
- High-concurrency booking of the exact same slot within milliseconds could technically encounter a race condition between read and transaction commit (mitigated in production by Medplum's transactional locks and ASC scheduling workflows where schedulers manage discrete room blocks).
