# PROGRESS — GI ASC EHR

> Single source of truth for **what is done, what is running, what is next**.
> Plan: [`docs/plan/implementation-plan.md`](docs/plan/implementation-plan.md) · Phase files: [`docs/plan/phases/`](docs/plan/phases/) · Mistakes log: [`LEARNING_MISTAKES.md`](LEARNING_MISTAKES.md)

## How agents update this file (mandatory)

1. **Start of a phase:** set its row to `in-progress`, fill *Owner* (agent/session or person) and *Branch*, commit alone: `chore(progress): start Pxx`.
2. **During:** if you split a phase (`P15a`/`P15b`), add rows; if you hit a blocking question, set `blocked` and add it to §4.
3. **End of a phase:** set `done`, fill *PR* and *Finished*, add a line to §3 *Done log* (newest first), move follow-ups to §5 *Next up*, recompute which phases are now `ready` (all deps `done`).
4. Keep entries factual and short. No PHI, no secrets, no customer names.
5. Sub-agents do **not** edit this file; the orchestrating agent does, after verifying their work.

**Status values:** `ready` (deps done) · `pending` (waiting on deps) · `in-progress` · `blocked` (open question/external) · `review` (PR open) · `done`.

---

## 1. Snapshot (update on every phase change)

| Updated | 2026-09-27 |
|---|---|
| Current wave | 0 (not started) |
| In progress | — |
| Ready to start | P00, P02, P03, P06 (needs Azure access) |
| Blocked | P13 soft-blocked on Q-MS1 (fallback allowed) |
| Go-live target | 2026-12-07 |

## 2. Phase board

| ID | Phase | Status | Depends on | Owner | Branch | PR | Started | Finished |
|---|---|---|---|---|---|---|---|---|
| P00 | Repo hygiene, guardrails | ready | — | | | | | |
| P01 | CI + eval gate | pending | P00 | | | | | |
| P02 | Local Medplum + bots skeleton | ready | — | | | | | |
| P03 | `@asc/fhir` | ready | — | | | | | |
| P04 | Medplum clients | pending | P02, P03 | | | | | |
| P05 | Auth + roles | pending | P04 | | | | | |
| P06 | Azure infra (dev) | ready (external: subscription/BAA) | — | | | | | |
| P07 | `@asc/clinical-rules` | pending | P03 | | | | | |
| P08 | Terminology + profiles | pending | P02, P03 | | | | | |
| P09 | UI clinical kit | pending | P00 | | | | | |
| P10 | Realtime SSE | pending | P04 | | | | | |
| P11 | Questionnaire renderer | pending | P03, P09 | | | | | |
| P12 | Worklists on Task | pending | P05, P07 | | | | | |
| P13 | Record engine port | pending | P09, Q-MS1 | | | | | |
| P14 | Registration | pending | P05, P09 | | | | | |
| P15 | Scheduling + whiteboard | pending | P14, P07, P10 | | | | | |
| P16 | H&P + med-hold | pending | P11, P13, P10, P07 | | | | | |
| P17 | Pre-op + consent | pending | P11, P15 | | | | | |
| P18 | Procedure capture | pending | P15, P10 | | | | | |
| P19 | Procedure-note pipeline | pending | P18, P13, P08, P12 | | | | | |
| P20 | AIMS flowsheet | pending | P15, P09 | | | | | |
| P21 | PACU + discharge | pending | P11, P20 | | | | | |
| P22 | Coding + charge export | pending | P19, P08 | | | | | |
| P23 | Pathology loop | pending | P18, P12 | | | | | |
| P24 | Fax + eCW | pending | P10, P12, Q-MS4/5 | | | | | |
| P25 | Scope log + adverse events | pending | P11, P12 | | | | | |
| P26 | Go-live hardening | pending | P19, P20, P22, P06 | | | | | |

## 3. Done log (newest first)

Work completed before this plan existed, grouped from git history (`origin/main` @ `6586423`):

| Date | Area | What | Ref |
|---|---|---|---|
| 2026-09-27 | Docs | Phase-wise implementation plan, 27 phase files, UI guidelines, PROGRESS + LEARNING_MISTAKES protocol | branch `worktree-docs-mindscript-wiring` |
| 2026-09-27 | Docs | MindScript overview + integration/wiring guide (06), product docs reconciled, colour block diagrams | `cc97877`, `b0b4596` |
| 2026-09-27 | Agents | Prompt caching for agent instructions + ADR | `115f119`, `0057f19` (PR #8) |
| 2026-09-26 | Docs | Agent memory/skills proposal, review, action plan; Mem0/Langfuse/Supermemory evaluation | `73ecc94`…`db72216` (PR #6, #7) |
| 2026-09-26 | Data | `@asc/db` (Postgres + Drizzle), local Postgres, agent run store | `9727aef` |
| 2026-09-26 | Agents | Gateway hardening (stateless providers, deadlines, refusal, usage, telemetry); run-state store; provenance context | `657d638`, `e8b695a` |
| 2026-09-26 | Worker | Split AI queues (interactive/background), job PHI hygiene; job contracts moved to shared packages | `41f3aee`, `abaacbb` |
| 2026-09-26 | Tooling | Dev-time skills: create-agent, change-agent-prompt, add-model, phi-review | `770366c` |
| 2026-09-25 | Web | Persona login/signup + role dashboards (mock data), axios client, Base UI fixes | `30295d7`…`881ed5a` |
| 2026-09-25 | Agents | Agent definition layer, typed model/provider/hosting config, BAA-gated PHI routing, `discharge-instructions` agent | `aebb379`…`f25e992` |
| 2026-09-25 | Platform | Logging/telemetry/audit packages with PHI redaction, fail-closed audit; JIT packages, tsup, OTel preload, env validation | `bec944d`, `afda8d3`, `c75d1ca` |
| 2026-09-25 | Docs | Product requirements, build/reuse matrix, target architecture, flows, delivery plan; ADRs; compliance; environments | `4233c6e` and others |
| 2026-09-25 | Repo | Turborepo scaffold (web/api/worker + packages), scope `@asc/*`, TS 7 + type-aware lint | `cf4d9fa`, `edfa04d`, `c1dfdf3` |

## 4. Blocked / open questions (cross-phase)

| ID | Question | Blocks | Owner | Status |
|---|---|---|---|---|
| Q-MS1 | Access to `Wybit-LLC/MindScript` source | P13, P16, P19, P22, P24 | eng lead | open |
| D1/Q10 | Medplum self-host vs hosted | P06, P26 | eng lead | open (recommend self-host) |
| P00-Q1 | Upgrade zod 4 / bullmq 6 / ioredis 6 / OTel before Wave 2? | P07+ | eng lead | open |
| Q4 | Biller file format | P22 | business | open |
| Q8 | CPT licence | P08, P22 | business | open |
| Q15/Q-MS7 | STT vendor + BAA | P18 | eng | open |
| Q-MS4/5 | faxagnet + Integuru hosting/BAA/outbound | P24 | MindScript team | open |

Full lists: [implementation plan §6](docs/plan/implementation-plan.md#6-cross-phase-open-questions), each phase file, [05 §5.4](docs/product/05-delivery-plan.md), [06 §7](docs/product/06-mindscript-integration.md#7-open-questions-for-the-mindscript-team).

## 5. Next up

1. **P00** repo hygiene (move `apps/web/src/lib/api/http.ts` into `@asc/api-client`, lint guardrails) — unblocks P01, P09.
2. In parallel: **P02** local Medplum, **P03** `@asc/fhir`.
3. Escalate week-1 questions: Q-MS1, D1, Azure subscription/BAA (P06), Q8 CPT licence.

## 6. Decisions log

| Date | Decision | Where recorded |
|---|---|---|
| 2026-09-27 | Execution follows `docs/plan/implementation-plan.md`; 05 Gantt superseded for scheduling | this file |
| 2026-09-27 | SSE client = fetch + `eventsource-parser` (bearer auth); `cmdk` excluded (Radix) | [UI guidelines](docs/agent/ui-guidelines.md) |
