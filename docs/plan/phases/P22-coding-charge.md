# P22 — Coding engine, coder queue, charge export

| Field | Value |
|---|---|
| Wave · Lane · Size | 3 · Clinical/AI · M (critical path) |
| Depends on | P19, P08 |
| Unblocks | P26 |
| Source mix | MS (dx → code binding, CCI checks, pre-sign validation, coding eval cases) + MP (`ChargeItem`, `Claim`, CPT CodeSystem) + NEW (GI CPT/modifier/ICD sequencing engine, `coding_suggest`, export adapter) |
| Requirements | M09-1…M09-7; D5 |
| Branch | `phase/P22-coding-charge` |

## Goal
Rules engine decides CPT/modifiers/ICD order from findings + intent (screening→diagnostic, PT/33, anesthesia propagation); `coding_suggest` agent only fills ambiguity and cites evidence resource IDs; coder queue to attest; export in biller's format.

## File structure
```text
packages/clinical-rules/src/coding/{cpt-select,modifiers,icd-sequence,cci,screening-conversion}.ts  NEW  golden cases reviewed by certified coder
packages/validation/src/coding/{suggestion,attest,export}.ts        NEW
packages/validation/src/agents/coding-suggest.ts                    NEW
packages/agents/src/agents/coding-suggest/*                         NEW
apps/worker/src/jobs/coding/*                                       NEW  branch in P19 job graph
apps/worker/src/jobs/charge-export/{index,adapters/csv,adapters/x12-837}.ts  NEW  adapter interface; implement the one biller needs
apps/api/src/routes/coding.ts                                       NEW  queue actions, attest, export trigger
packages/ui/src/components/clinical/{code-row,evidence-link}.tsx    NEW
apps/web/src/app/(clinical)/coding/queue/page.tsx · cases/[caseId]/coding/page.tsx  NEW
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Schemas | `@asc/validation` | contracts |
| T2 | Coding rules engine + golden fixtures | `@asc/clinical-rules` | tests |
| T3 | `coding_suggest` agent + evals | `@asc/agents` | agent |
| T4 | Coding job branch + export job | `apps/worker` | jobs |
| T5 | Coding API + components + pages | `apps/api` → `@asc/ui` → `apps/web` (3 sub-agents, sequential by dependency) | flow |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | all | — |
| T2 | T1 | T4 | T3 |
| T3 | T1 | T4 | T2 |
| T4 | T2, T3 | T5 web | T5 api/ui |
| T5 | T1 (api/ui), T4 (web e2e) | P26 | T2–T4 partially |

## Packages to add
None (CPT data depends on licence).

## Acceptance
- [ ] Golden cases (coder-reviewed) pass 100 %
- [ ] LLM output never final without coder attestation; every code has evidence IDs
- [ ] `coding.attest` uses the nonce-bound signing ceremony ([08 §5.2](../../product/08-identity-access-and-tenancy.md#52-step-up-for-high-risk-actions), [#58](https://github.com/imRahul05/ASC-EHR/issues/58)); the `coding_suggest` agent can never attest (test)
- [ ] Export validated against biller sample file
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q4 | Biller format | T4 export | CSV adapter first |
| Q8 | CPT licence | T2 data | Engine tested with synthetic code IDs |
| Q-MS8 | MindScript screening→diagnostic logic exists? | T2 | Build new |
