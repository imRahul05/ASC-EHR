# P19 — AI procedure-note pipeline + review + sign

| Field | Value |
|---|---|
| Wave · Lane · Size | 3 · AI · M (critical path; split P19a pipeline / P19b review+sign if needed) |
| Depends on | P18, P13, P08, P12 |
| Unblocks | P22, P26 |
| Source mix | **MS** (draft-first pipeline, `lib/verification`, `lib/checks`, critic + targeted regeneration, GI constitution, guideline advisor pattern, feedback tables) + MP (`Composition`, `Procedure`, finding `Observation`s, `Provenance`) + NEW (`procedure_note` agent, GI content) |
| Requirements | M05-1…M05-9; 04 §4.5; 06 §4; AI draft ≤ 60 s NFR |
| Branch | `phase/P19-procedure-note-pipeline` |

## Goal
On "end procedure", a worker job graph drafts the note section-by-section (streamed), verifies it with code, saves a preliminary Composition (draft visible), then runs critic + guideline branches in parallel; physician reviews exceptions in the Record engine and signs.

## Out of scope
Coding (P22) — the branch slot exists, P22 fills it.

## File structure
```text
packages/validation/src/agents/{procedure-note,note-critic}.ts       NEW  typed sections (findings[], interventions[], impression, BBPS, recs)
packages/validation/src/notes/{sign,review}.ts                       NEW
packages/clinical-rules/src/verification/{trace-to-source,consistency,required-elements}.ts  NEW  (port of MS lib/verification)
packages/clinical-rules/src/checks/gi-must-not-miss.ts               NEW  (port of MS lib/checks, GI procedure elements)
packages/agents/src/agents/procedure-note/*                          NEW
packages/agents/src/agents/note-critic/*                             NEW
packages/agents/src/knowledge/gi/                                    NEW  constitution content from MS (reviewed, synthetic examples only)
apps/worker/src/jobs/procedure-note/{index,draft,verify,persist,critic,finalize}.ts  NEW  one step per file, progress events (P10)
apps/api/src/routes/notes.ts                                         NEW  POST /cases/:id/generate-note (enqueue, return jobId), POST /notes/:id/sign
packages/db/src/schema/clinician-feedback.ts                         NEW  edit deltas (IDs + field paths, no free-text PHI) for style memory later
apps/web/src/app/(clinical)/cases/[caseId]/note/page.tsx             NEW  Record engine + streaming + exceptions list
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Agent I/O + note schemas | `@asc/validation` | contracts |
| T2 | Verification + GI checks (port) | `@asc/clinical-rules` | golden tests |
| T3 | `procedure_note` + `note_critic` agents + evals | `@asc/agents` | agents (create-agent, phi-review) |
| T4 | Worker job graph with progress | `apps/worker` | job + tests with fake model |
| T5 | Generate/sign endpoints + feedback table | `apps/api`, `@asc/db` | endpoints, migration |
| T6 | Note review page | `apps/web` | e2e: end procedure → draft < 60 s → sign |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | all | — |
| T2 | T1 | T4 | T3, T5 |
| T3 | T1 | T4 | T2, T5 |
| T4 | T2, T3 | T6 | T5 |
| T5 | T1 | T6 | T2–T4 |
| T6 | T4, T5 | P22 | — |

## Packages to add
None new.

## Acceptance
- [ ] Draft visible ≤ 60 s p95 on synthetic cases; critic never overwrites clinician edits
- [ ] Composition preliminary → final only via sign command; `sign-note` Task resolves (P12)
- [ ] The sign command is the nonce-bound signing ceremony ([08 §5.2](../../product/08-identity-access-and-tenancy.md#52-step-up-for-high-risk-actions), [#58](https://github.com/imRahul05/ASC-EHR/issues/58)):
  - re-authentication with password and TOTP, carrying a single-use nonce bound to the note's version and content hash;
  - `Provenance.signature` over that hash, written with the clinician's token;
  - batch signing of several notes allowed.
- [ ] Only a `staff` principal can sign; an `agent` or `service` principal is refused (test). An AI-drafted note's `Provenance` names the agent run as contributor and the clinician as attester
- [ ] Editing a `final` note is refused at gate 4 as well as by Medplum's `writeConstraint` (spike results ADR, decision 3)
- [ ] The worker and its AI tools run on the facility's own worker client (`asc-ehr-worker@<facility>`, chosen from the validated `job.facilityId`), never a shared or raw client, and re-check the acting user's grant before each PHI step ([#60](https://github.com/imRahul05/ASC-EHR/issues/60), [P05 §6](P05-auth-roles.md#6-gated-follow-ups-not-in-p05-start-no-later-than-the-gate))
- [ ] Every AI-touched resource has Provenance with agentExecutionId
- [ ] Evals: must-pass 100 %; judge ≥ 90 %
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q-MS1 | Source for verification/checks/constitution port | T2, T3 | Re-implement from 06 description |
| Q1 | Procedure mix (colon/EGD only?) — Q1 in 05 | T1 | Colonoscopy + EGD |
| Q2 | Physician reviewer for eval cases | T3 | Named reviewer required before go-live |
