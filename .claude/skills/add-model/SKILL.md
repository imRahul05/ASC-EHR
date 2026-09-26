---
name: add-model
description: Add, re-order, re-bind or retire an LLM in @asc/agents config (Recipe C of the AI Agents Guide) - logical model in config/models/<vendor>.ts with verified capabilities, hosting binding(s) in config/hosting/*, routing.ts order, BAA checks, deprecation, and proof via validateAgentConfig in the tests. Use when asked to add a new model version, change which model serves a tier or agent, bump a model id, retire a model, or add a provider/cloud. Not for prompt or agent-behaviour changes (use change-agent-prompt).
metadata:
  owner: engineering
  scope: dev-time
---

# add-model

Developer-time workflow; never loaded at runtime. Source of truth: `docs/agent/ai-agents-guide.md` section 7 (Recipe C) and `packages/agents/README.md` ("How the config fits together", "Common changes"). Read `packages/agents/src/config/` before editing.

`C` = `packages/agents/src/config`. The three layers are separate on purpose:

| Layer | File | Holds |
|---|---|---|
| WHAT | `C/models/<vendor>.ts` | logical model, label, description, capabilities, `deprecated` - no API ids |
| HOW | `C/providers/<sdk>.ts` | the only place `@ai-sdk/*` is imported; `baa` flag; model factory |
| WHERE | `C/hosting/<target>.ts` | logical model -> endpoint + exact API id / deployment name |
| POLICY | `C/routing.ts`, `C/tasks.ts` | tier -> ordered models (fallback order); task -> min tier + PHI |

## 1. Pick the path

| Goal | Edit only |
|---|---|
| New model | models + hosting binding(s) + routing (section 2) |
| Different model order for a tier | `C/routing.ts` (order = fallback order) |
| One agent must use a specific model | that agent's `definition.ts` `models: [Models.x]` pin |
| New id / snapshot for an existing model | the binding in `C/hosting/<target>.ts` |
| GPT model on Azure | app settings `createAzureHosting({ deployments })` - no package change |
| Retire a model | `deprecated: true` (section 4) |
| New provider / cloud | section 5 |

## 2. Add a model

- [ ] **Model** - `C/models/<vendor>.ts`, inside `defineModels({...})`: camelCase logical name (e.g. `claudeOpus6`), `vendor`, `label`, `description`, `capabilities`. Verify every capability (`Vision`, `Tools`, `StructuredOutput`) against the vendor's current docs and note the source in the PR - a wrong flag routes images or tools to a model that can't handle them. A new vendor = new file + spread into `Models` in `C/models/index.ts`.
- [ ] **Hosting** - add a binding in every target that serves it: `C/hosting/direct.ts` (`{ endpoint: '<endpoint>', id: '<exact API id>' }`); `C/hosting/azure.ts` for Claude-on-Anthropic bindings; OpenAI models on Azure are bound via app `deployments` settings, and if the model should be validated on Azure add it to the placeholder `deployments` in `HOSTING_TARGETS_FOR_VALIDATION` (`C/hosting/index.ts`). A model with no binding on a target is silently skipped there.
- [ ] **Routing** - place it in `C/routing.ts` per profile and tier. Order is fallback order; first entry is primary. Keep at least one BAA-endpoint model in every tier that PHI tasks can reach, on every hosting target. `budget` is for staging/tests (synthetic data only).
- [ ] **Pins** - update any agent `models:` pins that should use it.

## 3. BAA rules (compliance control, not a feature toggle)

- The BAA belongs to the **endpoint** (account/resource/region), not the model vendor: GPT on OpenAI API = no BAA; GPT on Azure OpenAI = Microsoft BAA.
- **Never set `baa: true`** in `C/providers/*` unless a countersigned BAA covers that exact endpoint. If the user asks you to flip it, ask for confirmation that the BAA is countersigned and who holds it; record that in the PR. Do not flip it to make a test pass.
- PHI calls are routed only to `baa: true` endpoints. If validation reports a PHI tier with no BAA model, add a BAA-hosted model to that tier - do not relax the filter.
- Provider-side retention: PHI endpoints must be stateless (no server-side storage / stored responses / conversation state). Provider defaults and options (e.g. storage flags, telemetry, timeouts) are set centrally in `C/providers/*` and the gateway - follow `packages/agents/README.md` for current gateway/provider options, and make sure a new provider or endpoint applies the same stateless setting as its peers.
- New provider SDK features (batch APIs, hosted memory, file stores) need a BAA/retention check before any PHI use.

## 4. Retire a model

Set `deprecated: true` in `C/models/<vendor>.ts` (keep it listed for history/UI). `validateAgentConfig()` then fails until the model is removed from every routing profile and every agent pin - remove it there, then delete hosting bindings when nothing references it.

## 5. Add a provider / cloud

Follow the README "Add a provider / cloud" steps: `pnpm --filter @asc/agents add @ai-sdk/<pkg>`; `C/providers/<sdk>.ts` returning an `Endpoint` (`baa: false` until the BAA is countersigned); `C/hosting/<target>.ts`; add it to `HOSTING_TARGETS_FOR_VALIDATION`. Credentials come from the app via `@asc/config` - never read `process.env` inside `@asc/agents`.

## 6. Verify

```bash
pnpm -s turbo run lint check-types test --filter=@asc/agents
```

`validateAgentConfig()` runs in `packages/agents/src/__tests__/validate.test.ts` across every routing profile x hosting target (including Azure-only) and every registered agent: no empty tier, no deprecated model routed, a BAA model for every PHI path, every agent capable and hosted. Typos in model or endpoint names fail to compile. Fix the config, never the validator.

## PR note

State: models added/changed/retired; capability sources; routing before -> after per profile/tier; hosting targets affected; BAA status of every endpoint the model runs on (and who confirmed any `baa` change); any app `deployments` settings ops must add.
