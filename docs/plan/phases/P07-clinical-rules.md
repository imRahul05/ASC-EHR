# P07 — `@asc/clinical-rules` + case state machine

| Field | Value |
|---|---|
| Wave · Lane · Size | 2 · Domain · M |
| Depends on | P03 |
| Unblocks | P12, P15, P16, P19–P23 |
| Source mix | NEW (+ MS verification/check *patterns*; code port lands in P19/P22 once Q-MS1 answered) |
| Requirements | 04 §4.2 state machine; M01 AC; readiness/discharge gates |
| Branch | `phase/P07-clinical-rules` |

## Goal
A pure, exhaustively tested rules package used identically by web (instant feedback), API (authoritative), and bots. First content: case-phase state machine + gate framework.

## Out of scope
Coding rules (P22), med-hold content (P16), scores (P20/P21) — only their folders/interfaces here.

## File structure
```text
packages/clinical-rules/package.json                 NEW "@asc/clinical-rules" (JIT), deps: @asc/fhir, date-fns, @date-fns/tz
packages/clinical-rules/src/index.ts                 NEW
packages/clinical-rules/src/result.ts                NEW RuleResult { ok, blocking[], warnings[], evidence[] } — shared shape
packages/clinical-rules/src/case-phase/machine.ts    NEW transitions table (Scheduled→…→Closed) + guard hooks
packages/clinical-rules/src/case-phase/machine.test.ts
packages/clinical-rules/src/gates/{types,ready-for-procedure,discharge}.ts   NEW gate interface + stubs returning "not configured"
packages/clinical-rules/src/time/facility-time.ts    NEW facility-timezone helpers
packages/clinical-rules/README.md                    NEW "pure functions only: no I/O, no Date.now() without injected clock"
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Scaffold + `RuleResult` + injected clock | `@asc/clinical-rules` | package |
| T2 | Case-phase machine (all transitions from 04 §4.2) with table-driven tests | `@asc/clinical-rules` | `nextPhases()`, `canTransition()` |
| T3 | Gate framework + ready/discharge gate skeletons | `@asc/clinical-rules` | typed gates |
| T4 | Zod for transition command + RuleResult | `@asc/validation` | schemas |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | T2, T3 | T4 |
| T2 | T1 | P15 | T3, T4 |
| T3 | T1 | P16, P21 | T2, T4 |
| T4 | — | P15 | T1–T3 |

## Packages to add
| Package | Version | Workspace |
|---|---|---|
| `date-fns` | 4.4.0 | `@asc/clinical-rules` |
| `@date-fns/tz` | 1.5.0 | `@asc/clinical-rules` |

## Acceptance
- [ ] No imports of `@medplum/core` client, fetch, fs, or `process.env`
- [ ] Every transition in 04 §4.2 has a test (allowed + disallowed)
- [ ] Each transition names the `@asc/authz` capability it needs (data in the transition table, never a role name); a matrix test covers transition × capability × facility (a grant at another facility must not allow it)
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q1 | Final phase list incl. "In room / Scope in / Scope out / PACU / Discharged / Closed" naming | T2 | Use 04 §4.2 as-is |
| Q2 | Facility timezone per Organization vs global | T1 | Per Organization (multi-site ready) |
