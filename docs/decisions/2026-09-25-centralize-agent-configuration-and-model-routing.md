---
status: accepted
date: 2026-09-25
decision-makers: 
---

# Centralize Agent Configuration and Model Routing

## Context and Problem Statement

As we adopt the Vercel AI SDK for agent orchestration, hardcoding model strings directly in routing logic creates a maintenance burden. LLM models update frequently — Anthropic's lineup moved from Claude 3.5 Sonnet to Opus 5.5 in under a year, OpenAI shifted from GPT-4o to the GPT-6 Astra/Sol/Luna family, and Google moved from Gemini 1.5 to the 3.8 generation. When a model is deprecated, we must search-and-replace strings throughout the codebase.

Additionally, we need:
1. **Provider segregation**: Each provider's models listed in their own catalog for clarity.
2. **Fallback chains**: If a model fails with a *transient* error (rate limit, 5xx/overloaded, timeout, network), the system must automatically try the next model in a defined order. Non-retryable errors (4xx, auth, schema validation) fail immediately.
3. **Frontend visibility**: The frontend may need to display or select which models are active — so config must not live in `.env` files (which are server-only secrets).

## Decision

We will centralize all model configuration into a highly modular `packages/agents/src/config/` directory using three layers:

1. **Provider Catalogs** (`config/providers/<provider>/catalog.ts`): Each provider has its own typed catalog listing every model. To eliminate string duplication and enable type-safe model references, each provider has a dedicated `constants.ts` file (e.g., `OPENAI_MODELS`). Adding a new model means adding one entry to constants and one to the catalog.
2. **Routing Table** (`config/routing.ts`): Maps each reasoning tier (`high` / `medium` / `low`) to an ordered fallback chain of `(provider, modelKey)` pairs. The first entry is the primary; subsequent entries are fallbacks tried in order.
3. **Task-Tier Map**: Maps each `TaskType` to its minimum reasoning tier, ensuring that critical tasks always hit capable models.

The router (`router.ts`) and gateway (`gateway.ts`) read exclusively from this config. No model strings exist anywhere else.

## Consequences

- **Good**: Model updates take seconds — edit one file, rebuild, done.
- **Good**: Automatic fallback across providers on transient errors (e.g., Anthropic → OpenAI → Google) — for calls with `containsPhi: true` the chain is first filtered to providers with a signed BAA (`baa: true`).
- **Good**: Frontend can import `PROVIDER_REGISTRY` and `getRoutingInfo()` to display model configuration without bundling API keys.
- **Good**: Provider-segregated catalogs make it obvious which models belong to which vendor.
- **Bad**: Adds a layer of indirection; you look up config.ts to see which model string runs.

## Implementation Plan

- **Affected paths**: 
  - `packages/agents/src/config/` (New directory containing `constants.ts` and `catalog.ts` per provider, plus `routing.ts` and `types.ts`)
  - `packages/agents/src/router.ts` (Reads config, resolves models, exposes `getFallbackChain()`)
  - `packages/agents/src/gateway.ts` (Fallback loop on transient model errors, BAA filtering for PHI, `agentExecutionId` per call)
  - `packages/agents/src/index.ts` (Re-exports all config types and constants)
- **Patterns to follow**: 
  - All model strings live in `config.ts` only.
  - New models → add to the provider catalog → optionally add to routing table.
  - Deprecated models → set `deprecated: true` → router skips them automatically.
- **Patterns to avoid**: 
  - Do NOT put model names in `.env`.
  - Do NOT import provider SDKs directly — use gateway functions.

### Verification

- [x] Provider catalogs contain latest 2026 models (GPT-6, Claude Opus 5.5, Gemini 3.8 Flash).
- [x] Router reads from config and resolves fallback chains.
- [x] Gateway executes with automatic fallback on transient model errors only.
- [x] PHI calls (`containsPhi: true`) route only to BAA providers; `NoCompliantModelError` otherwise.
- [x] Package builds successfully (`pnpm build --filter @repo/agents`).

## More Information
- Follows centralization rules in `AGENTS.md` (rules 4 and 5).
- Supersedes any previous approach of hardcoding model strings in router.ts.

## Amendment (2026-09-25)

Fallback narrowed to transient errors and PHI-aware BAA filtering added to the provider catalog (`baa: boolean`), per the PHI rule in `docs/COMPLIANCE_AND_PHI.md`. Gateway calls now require `containsPhi` and return audit metadata (`agentExecutionId`, provider, model, attempts).

## Amendment 2 (2026-09-25): typed, single-definition config

The per-provider `constants.ts` + `catalog.ts` pair and the string-keyed routing entries are replaced (same three-layer idea, less duplication):

- `config/reasoning.ts` — `Reasoning.Low/Medium/High` constant; tiers are never written as raw strings.
- `config/tasks.ts` — `Task.*` constant + `TASK_PROFILES` (minimum tier, `handlesPhi`, description); compiler rejects a task without a profile. Replaces `TASK_TIER_MAP`.
- `config/providers/<name>.ts` — one `defineProvider({ name, baa, createModel, models })` per vendor; each model is defined once and becomes a typed `ModelRef` carrying its provider. Models no longer declare a tier.
- `config/routing.ts` — `ROUTING_PROFILES` (`default`, `budget`) map each tier to `ModelRef` objects (`Models.anthropic.opus55`), so provider/model mismatches cannot compile. Replaces `ROUTING_TABLE`.
- `config/validate.ts` — `validateAgentConfig()` (run in tests) rejects empty tiers, routed deprecated models, duplicates, and PHI-capable tiers without a BAA model.
- Gateway calls take `task` + optional `reasoning` override instead of `taskType` + required `complexity`.

## Amendment 3 (2026-09-25): separate WHAT (models) from WHERE (hosting targets)

A model's API id and its BAA coverage depend on where it is served (vendor API, AWS Bedrock, Azure), not on the model itself. `config/providers/*` is replaced by:

- `config/models.ts` — logical models only (`Models.claudeOpus55`: vendor, label, description). No API ids.
- `config/hosting/<target>.ts` — a hosting target lists endpoints (`baa`, SDK adapter) and binds each logical model it serves to an endpoint + model id / deployment name. `direct` (vendor APIs) is implemented; Azure/AWS are added as factories when production's cloud is chosen.
- Routing profiles stay hosting-independent; the router skips models the active target does not host, and applies the BAA filter per endpoint.
- The app selects the target from its parsed env and passes `createGateway({ hosting })`; `validateAgentConfig()` checks every routing profile against every registered target.
- Audit metadata reports `hostingTarget`, `endpoint`, `modelName`, `modelId`.

## Amendment 4 (2026-09-25): one folder per concern, one file per vendor / SDK provider

`packages/agents/src/config/` is organized as:

- `models/<vendor>.ts` — WHAT: logical models per vendor (anthropic, openai, google).
- `providers/<sdk>.ts` — HOW: one file per Vercel AI SDK provider (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/azure`), each owning its BAA flag and model factory. Azure OpenAI is a factory (resource + Entra ID token or key).
- `hosting/<target>.ts` — WHERE: `directHosting` and `createAzureHosting(settings)` (GPT on Azure OpenAI by deployment name, optionally Claude on the Anthropic API).
- `validate.ts` runs every routing profile against `direct` and an Azure-only target (`HOSTING_TARGETS_FOR_VALIDATION`); this found the `budget` profile had no Azure-deployable medium/low model, fixed by adding `gpt6Luna`.

Diagrams: `packages/agents/README.md`.

