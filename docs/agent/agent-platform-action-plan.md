# Agent Platform — Action Plan

**Date:** 2026-09-26 · **Derived from:** [proposal](memory-skills-and-modern-techniques.md) + [architecture review](memory-skills-proposal-review.md)
**Purpose:** the short list of changes worth making so that, when real agents are built, they are **smoother** (fewer stuck/failed/duplicate runs), **faster**, **secure** (PHI-safe), and **scalable**. Everything else in the two docs is either already right or should wait.

Legend — **Goal:** 🟢 smooth · ⚡ fast · 🔒 secure · 📈 scalable · **Size:** S (< 1 day) · M (2–4 days) · L (1–2 weeks)

---

## 0. Implementation status (updated 2026-09-26)

| # | Item | Status | Where |
|---|---|---|---|
| 1 | Latency budget (attempt timeout + total deadline) | ✅ done | `packages/agents/src/runtime/gateway.ts`, `TaskProfile.latencyBudget` |
| 2 | Retry tuning per app | 📝 documented; apps must pass `maxRetriesPerModel` (api 1, worker 2) when they create gateways | `packages/agents/README.md`, AI Agents Guide §6.1 |
| 3 | Model health circuit breaker | ⏸ deferred — low traffic for one ASC; revisit if outages hurt | — |
| 4 | Provider `store: false` | ✅ done (wire-level tests) | `config/providers/{openai,azure-openai}.ts` |
| 5 | PHI-free telemetry | ✅ done (off by default; inputs/outputs never recorded) | gateway `telemetry` option |
| 6 | Token usage in meta + audit | ✅ done | `AgentExecutionMeta.usage` |
| 7 | Refusal fails closed + `failureKind` | ✅ done | `ModelRefusalError`, `classifyModelError` |
| 8 | Dev-time Claude Code skills | ✅ done | `.claude/skills/{create-agent,change-agent-prompt,add-model,phi-review}` |
| 9 | Worker hygiene (queues, retention, sanitized errors, ids-only jobs) | ✅ done | `apps/worker`, shared contracts in `@asc/config` / `@asc/validation` |
| 10 | Execution record + idempotent runs | ✅ done — interface + `isSameRunOwner` guard in `@asc/agents`; Postgres store in `@asc/db` (`agent_runs`) | ADR 2026-09-26 Postgres + Drizzle |
| 11 | Approval ends run (FHIR `Task`/`Provenance`) | ⏳ needs Medplum | — |
| 12 | Worker-run AI + SSE progress | ⏳ with first real job processor | — |
| 13 | Context metadata + manifest + derived `containsPhi` | ✅ done (interfaces + checks); providers come with first agent | `packages/agents/src/context/` |
| 14 | On-behalf-of retrieval | ⏳ needs Medplum access policies | — |
| 15–17 | Cache layout, effort mapping, per-model eval gate | ⏳ with first real agent traffic | — |

## 1. What we learned about today's runtime

| Finding | Where | Effect |
|---|---|---|
| Same-model retries: AI SDK default `maxRetries = 2`, backoff 2s → 4s (honours `retry-after`) | `gateway.ts` → `generateText({ maxRetries: maxRetriesPerModel })`; verified in `ai@7.0.114` | a failing model costs up to **3 calls + ~6s** before fallback |
| Fallback only on transient errors; refusals/schema/4xx/unknown fail closed | `runWithFallback`, `isRetryableModelError` | ✅ safe — keep |
| **No per-attempt timeout and no overall deadline** | gateway passes only the caller's `abortSignal` | ⚠️ a hung provider call can hang a run indefinitely |
| `agentExecutionId` is generated per gateway call | `createGateway` → `generateExecutionId()` | ⚠️ a retried job = new id, new model spend, possibly a duplicate draft |
| Worker has no attempts/backoff/idempotency, no PHI rules for failure reasons | `apps/worker/src/index.ts` | ⚠️ `failedReason` can carry provider error text into Redis/logs |
| `containsPhi` is caller-declared (forced true only for PHI tasks) | `run.ts`, `tasks.ts` | ⚠️ human-error path |
| **Azure OpenAI / OpenAI calls default to server-side storage** — `azure(id)` and `openai(id)` resolve to the Responses model, which sends `store: true` unless overridden (verified in `@ai-sdk/azure@4.0.79`, `@ai-sdk/openai@4.0.75`) | `providers/azure-openai.ts`, `providers/openai.ts` | 🔴 Azure OpenAI is our BAA/PHI path — prompts+outputs would be retained provider-side |
| Streaming uses the first model only | `streamAgentTask` | acceptable; don't rely on streaming for critical paths |

---

## 2. Do now — cheap, no database needed

| # | Change | Goal | Size | Where | Done when |
|---|---|---|---|---|---|
| 1 | **Latency budget in the gateway:** per-attempt timeout + overall deadline per call; stop falling back once the deadline is gone. Defaults by task (interactive ~60–90s total, background longer). | 🟢 ⚡ | S | `gateway.ts` (`AbortSignal.timeout` combined with caller signal), `tasks.ts` profile field | a hung provider can't block a run past its budget; test with a never-resolving mock model |
| 2 | **Tune retries per use:** interactive agents `maxRetriesPerModel: 1` (fail over faster), background `2`. | ⚡ | S | `createGateway` options in each app | worst-case time-to-fallback ≈ 2s instead of ~6s for interactive |
| 3 | **Model health circuit breaker:** after N consecutive transient failures, skip that model for a cool-down window so every request doesn't pay the retry tax. Redis-backed (shared across pods), no PHI. | 🟢 ⚡ 📈 | M | new `runtime/health.ts` consulted by router; Redis adapter injected by apps | provider outage → requests go straight to the healthy model |
| 4 | **Provider statelessness:** explicitly disable server-side storage (e.g. OpenAI/Azure Responses `store: false` via `providerOptions`); never use `previous_response_id`, Conversations, Gemini `previous_interaction_id`, Anthropic memory stores for PHI. | 🔒 | S | `config/providers/*` defaults + a test asserting the option is sent | **confirmed needed** (default is `store: true`); every OpenAI/Azure call sends `providerOptions.openai.store = false`; test pins it. **Highest-priority item.** |
| 5 | **Telemetry without PHI:** AI SDK telemetry with input/output recording off; record model, tier, attempts, latency, token + cache usage only. | 🔒 ⚡ | S | gateway `experimental_telemetry: { recordInputs: false, recordOutputs: false }` (present in `ai@7.0.114`) via `@asc/telemetry` | spans contain no prompt/output text |
| 6 | **Return token usage in `AgentExecutionMeta`** (input, output, cached). Measure before optimising. | ⚡ 📈 | S | `gateway.ts` meta, `run.ts` audit details (numbers only) | cost/latency per agent visible |
| 7 | **Refusal stays fail-closed** — add explicit test + audit `failureKind: 'refusal'` so rates are visible. Do **not** fall back on refusal. | 🔒 | S | `errors.ts`, `run.ts` | test proves refusal never reaches a second vendor |
| 8 | **Dev-time Claude Code skills:** `create-agent`, `change-agent-prompt`, `add-model`, `phi-review` (from AI Agents Guide recipes). | 🟢 ⚡ (dev speed) | S–M | `.claude/skills/` | new agent scaffolded + tests green in one command |
| 9 | **Worker hygiene:** job attempts 2 + exponential backoff; `removeOnComplete/removeOnFail` retention; sanitize `failedReason` to error class + ids; separate queues for **interactive** vs **background** AI work with per-provider rate limits/concurrency. | 🔒 🟢 📈 | S–M | `apps/worker` | no PHI in Redis; background batch can't starve interactive jobs or trigger 429 storms |

---

## 3. Do with the first real agent (needs Postgres / Medplum)

| # | Change | Goal | Size | Notes |
|---|---|---|---|---|
| 10 | **`agent_run` execution record + idempotent worker.** Row created before the model call, id derived from the job; retry reuses it; output persisted before side effects. `runAgent` accepts an external `executionId`. | 🟢 🔒 📈 | M | fixes duplicate drafts/spend on crash or redeploy. **ADR 1.** |
| 11 | **Approval ends the run.** Run → draft + FHIR `Provenance` (agentExecutionId, promptVersion, model) + review `Task`. Regenerate = new run. No paused agent processes. | 🟢 📈 | M | removes need for a durable workflow engine in Phase 1. **ADR 1.** |
| 12 | **Run AI in the worker, stream progress to UI** (Redis pub/sub → Fastify SSE); client reconnects and reads persisted result. | 🟢 📈 | M | generation survives tab close / API pod restart |
| 13 | **Context assembly v1:** `ContextProvider` with item metadata (source, authority, effective/retrieved time, max age, scope, sensitivity, trust, hash); per-run **context manifest** (no values) on `agent_run`; `containsPhi` **derived** from manifest; scope asserted = run scope. | 🔒 🟢 | M | stale data and cross-patient leaks become detectable. **ADR 2.** |
| 14 | **On-behalf-of retrieval:** context reads use the triggering user's Medplum access policy (or a narrow per-task agent policy) — never a super-user. | 🔒 | M | agent can't become an authorization bypass. **ADR 2.** |
| 15 | **Prompt layout for caching:** instructions → knowledge → org config → surgeon config → case facts; no ids/timestamps in the prefix. Turn on provider cache flags only once #6 shows prefixes above the provider minimum. | ⚡ | S | cheap once measured |
| 16 | **Effort mapping per tier** in routing config (not agent code), set explicitly per model. | ⚡ | S | config-only |
| 17 | **Eval gate per model-in-chain:** each agent's suite runs against every model its chain can reach, at configured effort; plus injection, staleness, scope-isolation and resumability tests. | 🔒 🟢 | M | fallback never serves an unevaluated model. **ADR 3.** |

---

## 4. Do when triggered — not before

| Trigger | Then do |
|---|---|
| First agent with **tools** | scope binding from run context (AI SDK `toolsContext`), typed tool-result mappers, per-call audit, write tools behind approval (`needsApproval`) |
| First **multi-turn** feature (scribe, coder Q&A) | conversation thread tables bound to org + patient + case, append-only, fresh retrieval every turn |
| First **clinical knowledge pack** | structured rules evaluated in code; `SKILL.md`-format explanatory packs, versioned, clinically reviewed, selected deterministically. **ADR 4.** |
| First **long multi-step tool loop** with waits | durable engine ADR (WorkflowAgent / Temporal / DBOS / Inngest) — must self-host on AKS and keep step state in our encrypted store |
| Real traffic data | caching tuning, batch APIs for non-urgent work (after BAA check), surgeon/org presentation config (closed schema) |

## 5. Don't do

- Refusal → other-vendor fallback.
- Learning "preferences" from clinician edits (use edits as an eval metric only).
- Vendor-hosted memory/state or third-party memory services for PHI.
- Model-selected skills (`load_skill`) for clinical agents; runtime skills with scripts.
- RAG/pgvector, tool search, programmatic tool calling, advisor pattern, Managed Agents — until a concrete need.

---

## 6. Impact summary

| Goal | Biggest wins |
|---|---|
| 🟢 **Smoother** | #1 deadlines, #3 circuit breaker, #10 idempotent runs, #11 approval-ends-run, #12 worker + SSE |
| ⚡ **Faster** | #2 retry tuning, #3 skip unhealthy models, #15 cache-friendly layout, #16 effort per tier, #8 dev skills (build speed) |
| 🔒 **Secure** | #4 stateless providers, #5 PHI-free telemetry, #7 refusal fail-closed, #9 Redis hygiene, #13–14 scoped/audited context, #17 per-model evals |
| 📈 **Scalable** | #3 shared model health, #9 split queues + rate limits, #10 execution records, #12 stateless API pods |

**Suggested order:** #4 (PHI retention, confirmed bug) → #1 → #2 → #7 → #5/#6 → #9 → #8 (all in about a week, no DB needed) → write ADR 1–3 → #10–#17 with the discharge-instructions agent as the first end-to-end path.
