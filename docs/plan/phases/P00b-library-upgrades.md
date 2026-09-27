# P00b — Library upgrades before Wave 2 (zod 4, bullmq 6, ioredis 6)

| Field | Value |
|---|---|
| Wave · Lane · Size | 0 · Platform · S |
| Depends on | P00 |
| Unblocks | Wave 2 (P07–P13) — new schemas, jobs and SSE progress are written once, on the new majors |
| Source mix | NEW |
| Requirements | Decision P00-Q1 (2026-09-28): upgrade zod + bullmq (+ ioredis) now, defer OpenTelemetry |
| Branch | `phase/P00b-library-upgrades` |

## Goal
Move the repo to `zod` 4 and `bullmq` 6 / `ioredis` 6 **before** feature phases add many schemas and jobs, so nothing is written twice. One dedicated commit per library; no behaviour change.

## Out of scope
OpenTelemetry 0.57 → 0.222 (deferred; revisit with P06/P26 observability work), React 19.3, any feature work.

## File structure
```text
package.json files (all workspaces using zod / bullmq / ioredis)   EDIT  version bumps, one library per commit
packages/validation/src/**            EDIT  zod 4 API changes (e.g. z.ZodIssueCode → issue codes, .email()/.uuid() string formats, error map)
packages/config/src/env.ts            EDIT  zod 4 for env parsing
packages/agents/src/**                EDIT  zod 4 schemas used by AI SDK 7 structured output
apps/web (@hookform/resolvers)        EDIT  resolver version that supports zod 4
apps/worker/src/**                    EDIT  bullmq 6 / ioredis 6 API changes (Worker/Queue options, connection)
apps/api (producers)                  EDIT  bullmq 6 Queue usage if any
docs/plan/implementation-plan.md §5   EDIT  baseline versions
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Read the official zod 4 migration guide (context7 / release notes) and list breaking changes that hit this repo | docs | checklist in the PR |
| T2 | zod 4 in `@asc/validation` + `@asc/config` (contracts first) | `@asc/validation`, `@asc/config` | tests green |
| T3 | zod 4 in `@asc/agents`, `apps/api`, `apps/worker`; `@hookform/resolvers` bump in `apps/web` | those workspaces | tests + evals green |
| T4 | bullmq 6 + ioredis 6 in `apps/worker` (+ producers in `apps/api`) | `apps/worker`, `apps/api` | worker tests green, local job round-trip |
| T5 | Update version baseline in the plan; PROGRESS | docs | done |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | T2, T3 | T4 |
| T2 | T1 | T3 | T4 |
| T3 | T2 | T5 | T4 |
| T4 | — | T5 | T1–T3 |
| T5 | T3, T4 | Wave 2 | — |

## Packages to change
| Package | From | To | Workspaces |
|---|---|---|---|
| `zod` | ^3.25 | ^4.6.5 | validation, config, agents, api, worker |
| `@hookform/resolvers` | ^3.9 | latest with zod 4 support | apps/web |
| `bullmq` | ^5.53 | ^6.3.9 | worker (+ api if it enqueues) |
| `ioredis` | ^5.6 | ^6.0.0 | worker |

## Acceptance
- [ ] `pnpm turbo run lint check-types test` green; agent evals green (mock model)
- [ ] `pnpm --filter web dev`: login, signup validation and dashboard still work (LM-005)
- [ ] Worker processes a sample job against local Redis
- [ ] One commit per library; PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q1 | Does AI SDK 7 structured output need any zod 4 adapter? | T3 | Follow the AI SDK 7 docs; keep schemas in `@asc/validation` |
