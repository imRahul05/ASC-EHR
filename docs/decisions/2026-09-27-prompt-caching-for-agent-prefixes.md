---
status: proposed
date: 2026-09-27
decision-makers:
---

# Prompt caching for agent prompt prefixes

## Context and Problem Statement

Every agent call re-sends the same instructions followed by per-case facts. Providers can cache a repeated prompt prefix (cached input costs roughly 5–10% of normal input and lowers latency), but the gateway sent no cache options: Claude — first in the `high` tier and the BAA path for PHI — never cached, and OpenAI calls had no cache key. `usage.cachedInputTokens` was already measured (action plan #6); cache **writes**, which Anthropic bills at 1.25×, were not.

Each vendor exposes caching differently through the Vercel AI SDK:

| Vendor | Mechanism | Retention / state |
|---|---|---|
| Anthropic | Opt-in `cache_control` breakpoints (per block, or top-level automatic) | 5 min (default) or 1 h; cache only |
| OpenAI | Automatic prefix caching; optional `prompt_cache_key`, `prompt_cache_retention` | `in_memory` (default) or `24h` extended |
| Azure OpenAI | Automatic prefix caching | in memory |
| Google Gemini | Implicit caching; explicit `cachedContent` is a stored server-side resource | explicit cache = stored object |

Constraints: provider-specific options live only in `config/providers/` (ADR: centralize agent configuration); calls stay stateless and nothing PHI-bearing is kept at a vendor beyond the call ("vendors compute, we store", `memory-skills-proposal-review.md`); fallback across vendors must keep working.

## Decision

1. **Endpoint-owned cache policy.** `Endpoint.promptCache` (in `config/providers/`) declares how an endpoint caches the stable prefix:
   - **Anthropic:** an explicit `cacheControl: { type: 'ephemeral' }` breakpoint on the instructions (system) message, 5-minute TTL. **Not** top-level automatic caching: our prompts end in unique per-case facts, so an automatic breakpoint would land after them and pay the write premium on every call with no read.
   - **OpenAI:** `promptCacheKey` + `promptCacheRetention: 'in_memory'` (no 24 h extended retention).
   - **Gemini:** none. Implicit caching only; explicit `cachedContent` is not used (stored server-side resource).
   - **Azure OpenAI:** none yet. Automatic caching only, until the resource's API version is confirmed to accept `prompt_cache_key` (an unknown parameter would be a 400 and fail PHI calls closed).
2. **Per-call cache key.** `AgentCallParams.promptCacheKey` turns caching on for a call. `runAgent` sets it to `name@promptVersion`: stable across runs, changed by every prompt bump, and free of PHI and ids. The gateway rejects keys outside `[A-Za-z0-9._@:-]{1,64}` before any model is called.
3. **Compliance options win.** The gateway merges the endpoint's cache options first and its mandatory `providerOptions` (`store: false`) last, so caching can never re-enable provider-side state.
4. **Kill switch.** `createGateway({ promptCaching: false })` sends no cache options at all.
5. **Measure both sides.** `AgentTokenUsage.cacheWriteTokens` joins `cachedInputTokens`; both are written to the `agent.run` audit event (numbers only).
6. **Prompt layout rule.** `instructions` hold only stable text; everything per case (facts, context items, ids, dates) goes in `messages`, after the breakpoint.

## Consequences

- **Good:** Claude calls with an instructions prefix above the model minimum (512 tokens on Opus 5.5 / Fable 5.1, 1024 on Sonnet 5, 4096 on Haiku 4.5) read it at ~0.05–0.1× on repeat runs within 5 minutes; OpenAI hit rate improves via the key.
- **Good:** No new vendor state. Caches are in-memory prefix caches within our own account; no stored cache objects, no extended retention.
- **Good:** Cost is visible per agent run (`cachedInputTokens`, `cacheWriteTokens`) before anyone claims savings.
- **Neutral:** Today's discharge-instructions prompt is likely below Anthropic's minimum: the breakpoint is a no-op (no error, no write charge) until prompts grow (knowledge, org config).
- **Bad:** For an agent run less than once per 5 minutes, Anthropic writes cost 1.25× on the prefix with no read. Watch `cacheWriteTokens` vs `cachedInputTokens` per agent; switch the TTL or disable per gateway if writes dominate.
- **Bad:** Caches are per vendor and model, so every fallback starts cold. Accepted: availability beats hit rate.

## Implementation Plan

- **Affected paths:** `packages/agents/src/config/providers/{define,anthropic,openai,google,azure-openai}.ts`, `runtime/router.ts`, `runtime/gateway.ts`, `agents/{define,run}.ts`, tests in `runtime/__tests__/prompt-cache.test.ts`.
- **Patterns to follow:** new endpoints declare `promptCache` next to their `providerOptions`, with a request-body test; agents keep `INSTRUCTIONS` static.
- **Patterns to avoid:** top-level automatic caching for single-shot agents; ids, timestamps or case data in `instructions`; PHI or ids in `promptCacheKey`; `promptCacheRetention: '24h'` or Gemini `cachedContent` on PHI paths without a compliance review.

### Verification

- [x] Anthropic request body: `cache_control` on the system block only; no top-level `cache_control`.
- [x] OpenAI request body: `prompt_cache_key`, `prompt_cache_retention: "in_memory"`, `store: false`.
- [x] Mandatory endpoint options override cache options; `promptCaching: false` sends none.
- [x] Invalid keys throw before any model call; usage and audit carry cache read/write counts.

## More Information

- Action plan item #15: [agent-platform-action-plan.md](../agent/agent-platform-action-plan.md)
- Caching analysis: [memory-skills-proposal-review.md](../agent/memory-skills-proposal-review.md) (§ prompt caching)
- Related ADRs: [Adopt Vercel AI SDK](2026-09-25-adopt-vercel-ai-sdk-for-agent-orchestration.md), [Centralize agent configuration](2026-09-25-centralize-agent-configuration-and-model-routing.md)
