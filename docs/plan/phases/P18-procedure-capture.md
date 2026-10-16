# P18 — Day of Surgery: Intra-Op Room Capture, Hard Gate 2 & Surgical Timeout (EP-F)

| Field | Value |
|---|---|
| Wave · Lane · Size | 4 · Clinical · L |
| Epic | **EP-F: Day of Surgery** (US-F-05, US-F-06, US-F-07) |
| Depends on | P15c.2, P16, P17, P07 |
| Unblocks | P19 (Procedure Note Pipeline), P20 (AIMS Flowsheet), P23 (Pathology Specimen Loop) |
| Source mix | NEW (Room Tablet UX, Timeout Attestation, ASGE Withdrawal Timer) + MP (`Observation`, `Procedure`, `DeviceUseStatement`) |
| Requirements | CMS 42 CFR § 416.52, Joint Commission Universal Protocol, ASGE 2022 Quality Indicators, SGNA Scope Reprocessing (168h hang time); NFR-2 (<500ms saves) |
| Branch | `feat/p18-intraop-timeout-and-gate2` |

---

## 1. Goal

Deliver the high-velocity, standing, gloved procedure room experience for Gastrointestinal (GI) endoscopy suites:
1. **US-F-05 Multi-Role Surgical Timeout Attestation**: Discrete confirmations (patient identity, planned procedure, site/laterality, consent match, allergy review, equipment present, prophylaxis, anticipated issues) attested by Attending Physician, Anesthesia Provider, and Circulating Nurse prior to scope insertion. Hard refusal of `procedure_start` without completed timeout.
2. **US-F-06 Hard Gate 2 Enforcement**: Automated lockout on transition from `preop` → `in_room`. Checks: `anesthesia_clearance`, `anticoagulation_clearance`, `equipment_readiness`, `escort_verified`. Permitted role overrides logged with reason and audit event.
3. **US-F-07 Intra-Procedure Event Log & ASGE Withdrawal Timer**: One-tap gloved milestone timestamps (`room_in`, `sedation_start`, `scope_in`, `cecal_intubation`, `scope_out`, `room_out`). Live cross-room withdrawal timer calculating time between cecal intubation and scope-out (ASGE standard ≥ 6.0 minutes).
4. **Scope Serial Tracking & 168-Hour Hang-Time Lock**: Mandatory endoscope serial number logging with sterile reprocessing hang-time validation (max 168 hours / 7 days per SGNA/CDC; zero waivers).

---

## 2. Regulatory & Clinical Specifications

- **The Joint Commission Universal Protocol & CMS 42 CFR § 416.52**: Surgical timeout must be completed immediately prior to procedure start with active participation from all procedure team members. Must be a discrete, retrievable medical record, not narrative text.
- **ASGE 2022 Quality Indicators for Colonoscopy**: Mean withdrawal time during screening colonoscopy with normal examinations must be ≥ 6 minutes to maximize adenoma detection rates (ADR). The timer must run live and be visible to the endoscopist.
- **SGNA & CDC Endoscope Reprocessing Guidelines**: Reprocessed flexible endoscopes have a maximum sterile hang time of 168 hours (7 days). Expired scopes cannot be used on patients under any override.

---

## 3. File Structure & Architectural Placement

```text
packages/validation/src/procedure/
├── timeout.schema.ts               # Timeout discrete confirmations & multi-role sign-off
├── events.schema.ts                # Intra-op milestone timestamps (room-in through room-out)
├── scope.schema.ts                 # Scope serial number & reprocessing hang-time validation
└── gate2-override.schema.ts        # Role-restricted Gate 2 waiver schema

packages/clinical-rules/src/procedure/
├── gate2.ts                        # Gate 2 rules (anesthesia, anticoagulation, equipment, escort)
├── withdrawal-time.ts              # ASGE withdrawal timer (cecum to scope-out >= 6 min)
└── scope-hangtime.ts               # 168-hour hang-time validation rule

packages/fhir/src/builders/
├── timeout.ts                      # FHIR Observation / DocumentReference for timeout record
├── procedure-events.ts             # Discrete LOINC/SNOMED procedure milestone Observations
└── device-use.ts                   # FHIR DeviceUseStatement linking scope serial to Encounter

apps/api/src/
├── controllers/
│   └── procedure.controller.ts     # Fastify controller for intra-op operations
├── routes/
│   └── procedure.ts                # Route definitions using clinicalMutationRoute / clinicalQueryRoute
│       ├── POST /cases/:caseId/timeout          (requireCapability: "timeout.record")
│       ├── POST /cases/:caseId/events           (requireCapability: "procedure.event")
│       ├── POST /cases/:caseId/scope            (requireCapability: "equipment.manage")
│       └── POST /cases/:caseId/gate2-override   (requireCapability: "gate.override")

packages/api-client/src/
├── procedure.ts                    # HTTP client methods for timeout, events, scope
└── react/hooks.ts                  # useTimeout, useRecordEvent, useAssignScope, useProcedureContext

packages/ui/src/components/clinical/
├── event-tap-bar.tsx               # Touchscreen gloved 48px+ milestone tap buttons
├── withdrawal-timer.tsx            # High-visibility live withdrawal clock (color-coded >= 6 min)
└── timeout-attestation-card.tsx    # Multi-role sign-off grid

apps/web/src/
├── app/(dashboard)/cases/[caseId]/procedure/page.tsx # Room tablet view
├── features/cases/procedure/
│   ├── timeout-modal.tsx           # Multi-role checklist & attestation modal
│   ├── event-log-strip.tsx         # Chronological milestone timestamp list
│   └── scope-assignment-card.tsx   # Serial scanner & hang-time status banner
└── mocks/handlers/procedure.ts     # Lockstep MSW mock handlers
```

---

## 4. Implementation Tasks

| ID | Task | Workspace | Output |
|---|---|---|---|
| **T1** | **Contracts & Validation Schemas** | `@asc/validation` | `timeoutAttestationSchema`, `intraopEventSchema`, `scopeAssignmentSchema`, `gate2OverrideSchema` |
| **T2** | **Clinical Rules & Calculations** | `@asc/clinical-rules` | `evaluateGate2`, `calculateWithdrawalTime` (ASGE 6-min rule), `validateScopeHangTime` (168h rule) |
| **T3** | **FHIR Resource Builders** | `@asc/fhir` | `buildTimeoutObservation`, `buildProcedureEventObservation`, `buildDeviceUseStatement` |
| **T4** | **Fastify Backend Endpoints** | `apps/api` | `procedure.controller.ts`, `procedure.ts` routes with `clinicalMutationRoute` pipeline |
| **T5** | **Client SDK & React Query Hooks** | `@asc/api-client` | HTTP methods, typed query keys, and invalidation hooks |
| **T6** | **Room UI Components & Page** | `@asc/ui`, `apps/web` | `EventTapBar`, `WithdrawalTimer`, `TimeoutModal`, `ScopeAssignmentCard`, lockstep MSW mocks |

---

## 5. Acceptance Criteria

- [ ] **Timeout Enforcement (AC-F-05-1..4)**: Patient identity, procedure, site/laterality, consent match, allergies, equipment, and anticipated issues are discretely attested by MD, CRNA/Anesthesia, and RN. Transition to `procedure_start` is strictly refused without completed timeout.
- [ ] **Gate 2 Refusal (AC-F-06-1..2)**: Attempted transition from `preop` to `in_room` fails with HTTP 409 `GATE_FAILED` if anesthesia clearance, anticoagulation clearance, equipment readiness, or escort verification is incomplete. Overrides record actor, credential, timestamp, and justification.
- [ ] **Intra-Op Event Logging (AC-F-07-1..5)**: Circulator marks room-in, sedation-start, scope-in, cecal intubation, scope-out, and room-out with sub-500ms response time at p95.
- [ ] **ASGE Withdrawal Timer (AC-F-07-2..3)**: Computed automatically between cecal intubation and scope-out. Displays live elapsed time in room UI with visual indicator (amber < 6 min, emerald >= 6 min).
- [ ] **Scope Hang-Time Lock (AC-F-07-4)**: Scope serial number assigned to case. If sterile reprocessing timestamp is > 168 hours in the past, scope is rejected with zero override allowance.
- [ ] **Type & Lint Safety**: Strictly 0 `any` and 0 `unknown` types across all packages (`<RULE[user_global]>`). 100% test pass rate across all Turborepo tasks.
