# P00 — Repo hygiene, guardrails, dependency baseline

| Field | Value |
|---|---|
| Wave · Lane · Size | 0 · Platform · S |
| Depends on | — |
| Unblocks | everything (P01, P09 directly) |
| Source mix | NEW |
| Requirements | NFR (maintainability); architecture rules 1–5 |
| Branch | `phase/P00-repo-hygiene` |

## Goal
Remove existing rule breaks before feature work copies them, and add lint guardrails so agents cannot repeat them. Establish `PROGRESS.md` / `LEARNING_MISTAKES.md` protocol (docs already added with this plan).

## Out of scope
Feature code, Medplum, library major upgrades (only decide them — see Q1).

## File structure
```text
packages/api-client/src/http.ts               NEW   axios/fetch client + ApiError (moved from apps/web/src/lib/api/http.ts)
packages/api-client/src/index.ts              EDIT  export http client
packages/types/src/api-error.ts               NEW   ApiErrorPayload / ApiErrorDetails types
packages/validation/src/api-error.ts          NEW   Zod for error payload (runtime-checked)
apps/web/src/lib/api/http.ts                  DELETE (callers import @asc/api-client)
apps/web/src/lib/api/{auth,dashboard}.api.ts  EDIT  → move request fns to @asc/api-client; web keeps hooks only
apps/web/src/lib/mock/**                      KEEP  until P05/P09 (msw replaces it)
packages/eslint-config/…                      EDIT  no-restricted-imports rules (below)
AGENTS.md                                     EDIT  session protocol (done in plan PR)
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Add `ApiError` types + Zod error schema | `@asc/types`, `@asc/validation` | exported types/schema |
| T2 | Move HTTP client + API request functions into `@asc/api-client` | `@asc/api-client` | `http.ts`, `auth.ts`, `dashboard.ts` |
| T3 | Point `apps/web` at `@asc/api-client`; delete app copies | `apps/web` | no `axios` import in `apps/web` |
| T4 | Guardrail lint rules: (a) `apps/**` may not import `axios`, `zod`, `@ai-sdk/*`, `@anthropic-ai/*`, `@radix-ui/*`, `cmdk`, `@medplum/react`; (b) `apps/web` may not import `@asc/api-client/server`; (c) no `export interface`/`z.object` in `apps/**` (custom rule or `no-restricted-syntax`) | `@asc/eslint-config` | lint fails on violations |
| T5 | Decide library upgrades (Q1); record in PROGRESS "Decisions" | docs | decision row |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | T2 | T4, T5 |
| T2 | T1 | T3 | T4, T5 |
| T3 | T2 | — | T4 |
| T4 | — | P01 | T1, T2, T5 |
| T5 | — | P07 (if upgrading zod) | all |

## Packages to add
None. `axios` moves from `apps/web` to `@asc/api-client` (or drop for native `fetch` — Q2).

## Acceptance
- [ ] `grep -rn "from \"axios\"" apps/` → empty
- [ ] `grep -rnE "export (interface|type) |z\.object\(" apps/*/src` → empty (or allow-listed, e.g. Next page props)
- [ ] Lint fails on a deliberately bad import (add a lint test fixture)
- [ ] Login/dashboard still work with mocks (`pnpm dev`, manual smoke)
- [ ] PROGRESS.md: P00 `done`; LEARNING_MISTAKES LM-001 marked "guarded by lint"

## Open questions
| ID | Question | Blocks | Default if unanswered |
|---|---|---|---|
| Q1 | Upgrade `zod` 3→4, `bullmq` 5→6, `ioredis` 5→6, OTel 0.57→0.222 now? | P07+ | Upgrade zod + bullmq before Wave 2 (AI SDK 7 supports zod 4); OTel later |
| Q2 | Keep axios or use native `fetch` in `@asc/api-client`? | T2 | Native `fetch` (one less dep; SSE needs fetch anyway) |
