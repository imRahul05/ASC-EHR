# P12 — Worklist engine on FHIR `Task` + first Bots

| Field | Value |
|---|---|
| Wave · Lane · Size | 2 · Domain · M |
| Depends on | P05 (through P05j), P07 (bots from P02) |
| Unblocks | P19 (sign Task), P23, P24, P25 |
| Source mix | MP (`Task`, Bots, Subscriptions) + MS UX (worklist rows, cancelled-appt follow-up) |
| Requirements | D4; M12-7 Sign Queue; M10-3; X3 |
| Branch | `phase/P12-worklists-task` |

## Goal
All queues are `Task`s with a `code` from our worklist CodeSystem. One worklist UI lists them by role; Bots auto-create and auto-resolve. First kinds: `sign-note`, `cancelled-followup`, `referral-intake`, `specimen-outstanding` (rules for specimen in P23).

## Out of scope
Each kind's business logic beyond create/resolve hooks.

## File structure
```text
packages/fhir/src/terminology/codesystems/worklist-kinds.ts   NEW
packages/fhir/src/builders/task.ts                           EDIT due date, owner role, focus
packages/clinical-rules/src/worklists/{deadline,priority}.ts  NEW  regulatory countdown (e.g. sign within N h)
packages/validation/src/worklists.ts                         NEW  filters + actions schemas
packages/ui/src/components/worklist/{worklist-table,worklist-row,deadline-badge}.tsx  NEW
apps/bots/src/task-sign-note.ts                               NEW  create on Composition preliminary, resolve on final
apps/bots/src/task-cancelled-followup.ts                      NEW  Appointment cancelled/noshow → Task (MS Recovery-queue semantics)
apps/bots/scripts/deploy-bots.ts                              NEW  deploy + Subscription upsert
apps/web/src/app/(clinical)/worklists/[kind]/page.tsx         NEW
apps/web/src/features/worklists/use-worklist.ts               NEW  useSearchResources('Task', …) + useSubscription for live
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Worklist codes + Task builder + schemas | `@asc/fhir`, `@asc/validation` | contracts |
| T2 | Deadline/priority rules | `@asc/clinical-rules` | pure fns + tests |
| T3 | Bots + deploy script | `apps/bots` | 2 bots live locally |
| T4 | Worklist components | `@asc/ui` | table/row/badge |
| T5 | Worklist page (live via Medplum subscription) | `apps/web` | page |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | T2–T5 | — |
| T2 | T1 | T4 | T3 |
| T3 | T1 | P19, P23 | T2, T4 |
| T4 | T1 | T5 | T3 |
| T5 | T4 | — | T3 |

## Packages to add
None new (Medplum packages already added).

## Acceptance
- [ ] Creating a preliminary Composition creates a `sign-note` Task within 5 s; finalising resolves it
- [ ] Worklist updates live without refresh
- [ ] AccessPolicy: each role sees only its kinds
- [ ] Work items are owned by a queue/capability, never a role key (P05 rule; no role-name checks)
- [ ] Worker identity follow-up from [P05 §6](P05-auth-roles.md#6-gated-follow-ups-not-in-p05-start-no-later-than-the-gate) done before any worker job reads or writes PHI: own `ClientApplication` with a narrow policy, job data `{tenantId, facilityId, actor}` IDs only (08 §9)
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q-MS2 | Does MindScript have a Sign Queue to port UX from? | T4 | Build from MS row pattern |
| Q1 | Regulatory sign deadline (hours) per state/accreditor | T2 | 24 h configurable in `@asc/config` |
