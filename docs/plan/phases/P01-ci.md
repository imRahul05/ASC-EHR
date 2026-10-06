# P01 — CI pipeline + agent eval gate

| Field | Value |
|---|---|
| Wave · Lane · Size | 0 · Platform · S |
| Depends on | P00 |
| Unblocks | Every later merge (quality gate) |
| Source mix | NEW (MindScript eval harness idea: LLM judge + graded cases) |
| Requirements | NFR AI safety ("eval suite per agent gated in CI") |
| Branch | `phase/P01-ci` |

## Goal
Every PR runs lint, type-check, unit tests, build, and agent evals against a deterministic mock model. Nightly job runs evals on real BAA models with synthetic data only.

## Out of scope
Deploy pipelines (P06/P26), Langfuse integration (see memory-tools evaluation — later).

## File structure
```text
.github/workflows/ci.yml          NEW  pnpm install (cache) → turbo lint check-types test build (affected only)
.github/workflows/evals.yml       NEW  PR: evals with mock model · nightly: live BAA models, synthetic cases
packages/agents/src/testing/      EDIT eval runner entry (reads each agent's evals/cases.ts)
packages/agents/package.json      EDIT "eval" script
turbo.json                        EDIT eval task, outputs, env passthrough
apps/web/playwright.config.ts     NEW  e2e skeleton (1 smoke test: login page renders)
apps/web/e2e/smoke.spec.ts        NEW
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | CI workflow (lint/types/test/build, turbo cache, pnpm 10) | repo root | `ci.yml` |
| T2 | Eval runner over `src/agents/*/evals/cases.ts`, JSON report, fail on threshold | `@asc/agents` | `pnpm --filter @asc/agents eval` |
| T3 | Evals workflow (PR mock; nightly live) | repo root | `evals.yml` |
| T4 | Playwright skeleton + smoke test | `apps/web` | `pnpm --filter web e2e` |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | T3 | T2, T4 |
| T2 | — | T3 | T1, T4 |
| T3 | T1, T2 | — | T4 |
| T4 | — | — | T1–T3 |

## Packages to add
| Package | Version | Workspace |
|---|---|---|
| `@playwright/test` | 1.63.0 | `apps/web` (dev) |

## Acceptance
- [ ] PR shows green checks for ci + evals (mock)
- [ ] Breaking an eval case fails CI
- [ ] No secrets in PR workflows; nightly uses environment-scoped secrets
- [ ] `ci.yml` runs a Postgres service and sets `TEST_DATABASE_URL`, so the `@asc/db` RLS and tenant-isolation tests run; `CI=true` without it fails `require-db-in-ci.test.ts` ([P05e decisions](P05-auth-roles.md), #8)
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| Q1 | GitHub-hosted runners OK for synthetic-only data? | T1 | Yes — no PHI ever in CI |
| Q2 | Eval pass threshold per agent | T2 | 100 % on must-pass cases, ≥ 90 % judged |
