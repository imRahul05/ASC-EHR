# Memory Tools Evaluation — Mem0, Langfuse, Supermemory `company-brain`

### under REVIEW - NOT APPORVED - DO NOT APPLY ANY OF THIS , this is just for info

**Date:** 2026-09-26 · **Question:** can off-the-shelf tools solve or enhance our agent memory problem so we don't hand-build it?
**Read with:** [memory-skills-proposal-review.md](memory-skills-proposal-review.md) (§1 vocabulary: clinical record, context, knowledge, conversation / execution / workflow state, memory), [agent-platform-action-plan.md](agent-platform-action-plan.md), [AI Agents Guide](ai-agents-guide.md).

---

## 1. TL;DR

| Tool                            | What it actually is                                                                                                                     | Solves which of _our_ problems                                                                                                                              | Verdict                                                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Mem0**                        | LLM-driven memory layer: an LLM extracts "facts" from conversations, stores them in a vector DB (pgvector/Qdrant), retrieves them later | Model-writable **memory** (user/agent facts across sessions) — the kind the review says we should **not** use for clinical data in Phase 1                  | ❌ **Not for the clinical path.** ⚠️ Possible later for non-PHI internal assistants, only as a backend behind our interfaces |
| **Langfuse**                    | Open-source LLM **observability + prompt management + evals/datasets** (OpenTelemetry-based)                                            | Not memory. Solves the adjacent gaps we _do_ have: per-model eval gate (#17), tracing/cost/latency, clinician-edit feedback scores, dataset regression runs | ✅ **Adopt (self-hosted)** — highest value of the three                                                                      |
| **Supermemory `company-brain`** | Apache-2.0 **Slack bot** on Cloudflare Workers that remembers Slack conversations; memory stored in **Supermemory cloud**               | Nothing in the EHR runtime. Could serve _internal team knowledge_ (engineering decisions), not patient care                                                 | ❌ **Not for the product.** Optional internal tool if the team wants it, never with PHI                                      |
| _(Supermemory API itself)_      | Hosted/self-hostable memory + retrieval API (SOC 2 / HIPAA claims, BAA on request, self-host on higher tiers)                           | Future **knowledge** retrieval (protocols, policies) if static skills outgrow the prompt                                                                    | ⏸ **Defer**; compare with pgvector in our Postgres when RAG is actually needed                                               |

**Bottom line:** none of these tools replaces what we built — and that's expected. Our "memory" for clinical agents is _retrieval from Medplum + typed context + execution state_, which must stay under our BAA, audit and routing controls. The tool that genuinely removes manual work is **Langfuse** — for evals, tracing and feedback, not memory.

---

## 2. Our memory problem, restated (what needs solving)

| Layer (review §1)                             | Current solution (after PR #6)                                  | Could a tool replace it?                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Clinical record                               | Medplum FHIR (planned); fresh retrieval per run                 | **No** — source of truth, must be our access-controlled FHIR store                                       |
| Context                                       | `@asc/agents` `ContextItem` + scope/freshness checks + manifest | **No** — it's the safety boundary (scope, authority, staleness)                                          |
| Execution state                               | `AgentRunStore` + `@asc/db` Postgres `agent_runs`               | **No** — tiny, done, tested; a tool adds a dependency without removing code                              |
| Workflow state                                | FHIR `Task` / `Provenance` (planned)                            | **No** — belongs in the medical record                                                                   |
| Conversation state                            | not built (no multi-turn feature yet)                           | **Partly** — Mem0/Supermemory could hold threads, but a Postgres table is simpler and keeps PHI in place |
| Knowledge                                     | static skills (planned) → RAG later                             | **Maybe later** — Supermemory / Mem0 / pgvector as retrieval backend for _non-PHI_ protocols             |
| Model-written memory                          | intentionally none in Phase 1                                   | Mem0 / Supermemory are exactly this — which is why they don't fit the clinical path                      |
| **Evals / feedback / tracing** (adjacent gap) | only unit tests + synthetic eval cases                          | **Yes — Langfuse**                                                                                       |

---

## 3. Mem0

**What it is** — [External]

- Apache-2.0 memory layer; Python and Node (`mem0ai`) SDKs; library mode (local Qdrant default) or self-hosted server (Docker Compose, Postgres + pgvector, dashboard, per-user API keys, audit logging).
- Memory is created by **LLM calls that extract and update facts** from messages (defaults: an OpenAI chat model + OpenAI embeddings; configurable to Anthropic/Gemini).
- Vercel AI SDK integration `@mem0/vercel-ai-provider` (community-maintained): `createMem0({ provider, mem0ApiKey })` **wraps the model provider**; helpers `addMemories`, `retrieveMemories`, `getMemories`, `searchMemories`. Docs list OpenAI, Anthropic, Google, Groq, Cohere — **Azure not listed**. Defaults to Mem0 cloud (`MEM0_API_KEY`), with a `host` option for self-hosted.
- Hosted platform: HIPAA described as self-attested / maturing; self-hosted: compliance is ours.

**Fit with our architecture** — [Assessment]

| Concern                            | Impact                                                                                                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createMem0` wraps the model       | ❌ Bypasses `@asc/agents` gateway → no BAA-filtered routing, no `store:false`, no deadlines, no refusal fail-closed, no audit. Violates the AI Agents Guide MUST rules. **Never use the Vercel provider.** |
| Extraction makes its own LLM calls | ❌ PHI would go to an LLM outside our gateway and audit. Even pointed at a BAA endpoint, those calls are unaudited and un-routed.                                                                          |
| Model-written facts                | ❌ The review's core finding: model-derived patient "facts" drift, can be poisoned, and can silently override the record (authority monotonicity). Clinical facts must come from Medplum.                  |
| Cross-patient isolation            | ⚠️ Scoped by `user_id`/`agent_id`/`run_id` strings — our org/patient/case scope and `isSameRunOwner` guarantees would have to be re-implemented around it.                                                 |
| Storage                            | ✅ Self-hosted server can use Postgres + pgvector (same Postgres family as `@asc/db`).                                                                                                                     |

**Where it could help later (non-PHI only):**

- An internal assistant (e.g. staff helpdesk, scheduling preferences with no clinical content) needing cross-session user memory.
- Condition: use the **OSS library/server self-hosted**, configure its LLM + embeddings through BAA/approved endpoints, wrap it behind a `ContextProvider` (read) so reads still produce `ContextItem`s with `authority: 'model-derived'`, and never let its output feed clinical agents.

**Verdict:** ❌ for clinical memory. ⏸ Revisit only for a concrete non-clinical multi-session feature, via ADR.

---

## 4. Langfuse

**What it is** — [External]

- Open-source "AI engineering platform": **tracing/observability** (LLM calls, sessions, agent steps), **prompt management** (versioned prompts, playground), **evaluation** (LLM-as-judge, code evaluators, user feedback, manual labelling, datasets, experiments). Built on OpenTelemetry.
- Self-host: MIT core on every tier; stack = Postgres + ClickHouse + Redis + S3/Blob. Encryption options for self-hosting.
- Compliance: **data masking is Enterprise-licensed**; **BAA** offered on the managed HIPAA cloud region (Pro+) and with the self-hosted Enterprise tier.

**It is not a memory product** — but it closes gaps the review flagged:

| Review / plan gap                                      | Langfuse feature                                                                                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| #17 per-model-in-chain eval gate                       | Datasets + experiments: run each agent's synthetic eval set against every model in its chain, compare scores per `promptVersion` × model |
| Clinician edit rate as quality signal (review §7, §14) | Scores / user feedback attached to a trace by `agentExecutionId` (numbers only: edit distance, accepted/rejected)                        |
| Cost / latency / cache visibility (#6, #15)            | Token + cost + latency dashboards from our OTel spans                                                                                    |
| Fallback / refusal / timeout monitoring                | Filter traces by `failureKind`, model, tier                                                                                              |
| Prompt regression tracking                             | Link traces to `promptVersion`; compare versions                                                                                         |

**PHI design (important)** — [Assessment]

- Our gateway already emits AI SDK telemetry with **`recordInputs: false`, `recordOutputs: false`** (PR #6). Traces carry model, task, tokens, latency, ids — **no prompt/output text**. That makes a self-hosted Langfuse low-PHI by construction; masking (Enterprise) is not required for this mode.
- Evals run on **synthetic** cases (our `evals/cases.ts`) in dev/staging, where recording inputs/outputs is acceptable because no PHI exists there. Production keeps recording off.
- Self-host inside our Azure subscription (AKS + Azure Postgres + ClickHouse + Redis + Blob) so trace metadata never leaves our BAA boundary; or use the managed HIPAA region **only** with a signed BAA.
- **Prompt management: keep prompts in code.** Our prompts require `promptVersion` bumps, evals and clinical review via PR. Editing prompts in a UI would bypass that. Use Langfuse to _observe_ prompt versions, not to _serve_ them.

**Integration path (small, no new runtime coupling):**

1. `@asc/telemetry` gains an OTLP exporter targeting Langfuse's OTel endpoint (config via `@asc/config`); `createGateway({ telemetry: { isEnabled: true } })` in apps.
2. Add `agentExecutionId`, `promptVersion`, `agent`, `failureKind` as span attributes (ids/enums only).
3. An eval runner script (dev/staging) that pushes synthetic dataset runs + scores to Langfuse.
4. Later: clinician edit metrics → Langfuse scores keyed by `agentExecutionId`.

**Verdict:** ✅ **Adopt, self-hosted** — needs an ADR (new infra: ClickHouse + Blob; licensing tier; where it runs; retention).

---

## 5. Supermemory `company-brain` (and Supermemory API)

**What `company-brain` is** — [External]

- Apache-2.0 open-source **Slack bot** ("a teammate in your Slack that truly knows and understands your company"): remembers Slack decisions, answers from team knowledge, takes actions via GitHub/Linear/Notion/Google Workspace and MCP.
- Runs on **Cloudflare Workers + Durable Objects + D1**; **memory backend is the Supermemory cloud API (required)**.
- Permission model: reads with the asker's own access; private channel / DM memory stays restricted.
- Young as open source (~220 stars at time of review; previously a paid product).

**Supermemory API** — [External]: memory + retrieval API; claims SOC 2 Type 2, HIPAA and GDPR; BAA via sales; self-hosting / dedicated instances on higher tiers.

**Fit** — [Assessment]

- `company-brain` is a **team-collaboration bot**, not an EHR component. Slack must never carry PHI, so using it for clinical memory is out of scope by definition.
- Cloudflare + Supermemory cloud = PHI outside our Azure BAA boundary — ruled out for anything clinical.
- Its good idea worth copying: **"read with the asker's own access"** — exactly our on-behalf-of retrieval requirement (#14).
- Possible _internal_ use: engineering/ops knowledge ("why did we choose Drizzle?") — non-PHI, optional, unrelated to product architecture.
- Supermemory API as a future **knowledge retrieval** backend (clinical protocols, payer policies — non-PHI) is plausible, but compare against **pgvector in our existing Postgres** first (no new processor, no new BAA).

**Verdict:** ❌ for the product. Optional internal team tool. ⏸ Supermemory API only in a future RAG ADR.

---

## 6. Recommendation

| Priority | Action                                                                                                                                                           | Why                                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1        | **ADR + adopt self-hosted Langfuse** for tracing, cost, evals and feedback scores (metadata-only traces in production; full traces only for synthetic eval runs) | Removes the most manual work that's actually left (eval gate, monitoring, quality signals) without touching PHI boundaries |
| 2        | Keep clinical memory as built: Medplum retrieval → `ContextItem` → `runAgent`; execution state in `@asc/db`                                                      | No tool does this better without breaking BAA routing, audit or scope isolation                                            |
| 3        | When a multi-turn feature arrives: conversation threads as a Postgres table in `@asc/db`                                                                         | Simpler than an external memory service; PHI stays in place                                                                |
| 4        | When knowledge outgrows static skills: RAG ADR comparing **pgvector in `@asc/db`** vs Supermemory API vs Mem0 OSS                                                | Decide with real volume; non-PHI knowledge only                                                                            |
| 5        | Never: Mem0 Vercel provider, any memory service that wraps the model or makes its own LLM calls with PHI, Slack/Cloudflare-hosted memory for clinical data       | Bypasses gateway, audit, BAA routing, `store:false`                                                                        |

### Integration rule for any future memory tool

A memory/knowledge tool may be used only if **all** hold:

1. It sits **behind a `ContextProvider`** (reads) — never wraps the model or calls LLMs with PHI on its own.
2. Its storage is self-hosted in our BAA boundary, or the vendor signs a BAA for that exact service.
3. Every read yields `ContextItem`s with correct `authority` (usually `knowledge` or `model-derived`), `scope`, and freshness.
4. Its own LLM/embedding calls (if any) go to approved endpoints, and it is never fed PHI unless (2) holds.
5. It is org/patient/case-scoped with the same guarantees as `isSameRunOwner`.

---

## Sources

- Supermemory `company-brain` — https://github.com/supermemoryai/company-brain
- Supermemory security & pricing — https://supermemory.ai/docs/overview/security · https://supermemory.ai/pricing/
- Mem0 open source — https://docs.mem0.ai/open-source/overview · https://github.com/mem0ai/mem0
- Mem0 Vercel AI SDK provider — https://docs.mem0.ai/integrations/vercel-ai-sdk · https://ai-sdk.dev/providers/community-providers/mem0
- AI SDK memory approaches — https://ai-sdk.dev/docs/agents/memory
- Langfuse docs — https://langfuse.com/docs · self-hosting https://langfuse.com/self-hosting · data masking https://langfuse.com/self-hosting/security/data-masking · encryption https://langfuse.com/self-hosting/configuration/encryption · security https://langfuse.com/security
- Mem0 compliance comparison (secondary source) — https://dev.to/anajuliabit/mem0-vs-zep-vs-langmem-vs-memoclaw-ai-agent-memory-comparison-2026-1l1k

_Vendor compliance claims (HIPAA, BAA, SOC 2) are taken from vendor pages and secondary sources; confirm in writing with each vendor before any PHI decision._
