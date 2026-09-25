# @repo/agents

Single entry point for every LLM call: model configuration, routing, hosting (vendor APIs / Azure / later AWS), PHI/BAA enforcement, fallback, and audit metadata. `apps/api` and `apps/worker` both use it, so there is exactly one place to change models.

## Folder map

```
src/
├── gateway.ts              executeAgentTask / executeAgentObject / streamAgentTask, createGateway()
├── router.ts               task → tier → models → hosting → BAA filter
├── errors.ts               NoCompliantModelError, AgentExecutionError, retry classifier
└── config/
    ├── reasoning.ts        Reasoning.Low | Medium | High  (+ what each tier is for)
    ├── tasks.ts            Task.*  → minimum tier, handlesPhi, description
    ├── routing.ts          ROUTING_PROFILES (default, budget): tier → ordered models
    ├── validate.ts         validateAgentConfig() — run in tests
    ├── models/             WHAT  — logical models, one file per vendor (no API ids)
    │   ├── anthropic.ts        claudeOpus55, claudeSonnet5, …
    │   ├── openai.ts           gpt6Astra, gpt6Sol, …
    │   └── google.ts           gemini38Flash, …
    ├── providers/          HOW   — one file per Vercel AI SDK provider (@ai-sdk/*): BAA flag + model factory
    │   ├── anthropic.ts        @ai-sdk/anthropic   (BAA ✔)
    │   ├── openai.ts           @ai-sdk/openai      (no BAA)
    │   ├── google.ts           @ai-sdk/google      (no BAA)
    │   └── azure-openai.ts     @ai-sdk/azure       (Microsoft BAA ✔, factory: resource + credentials)
    └── hosting/            WHERE — which providers serve which models, with real ids / deployment names
        ├── direct.ts           vendor APIs (default today)
        └── azure.ts            createAzureHosting(settings): GPT on Azure OpenAI (+ Claude on Anthropic API)
```

| Question | Look in |
|---|---|
| Which models do we use? | `config/models/<vendor>.ts` |
| Which SDK / account talks to a vendor, and is it under a BAA? | `config/providers/<sdk>.ts` |
| What is the exact model id / Azure deployment name? | `config/hosting/<target>.ts` |
| Which model answers a High-tier call, and what is the fallback? | `config/routing.ts` |
| What tier / PHI policy does a task get? | `config/tasks.ts` |

**Why three folders instead of one file per vendor:** the same model runs in different places with different ids (`claude-opus-5-5` on the Anthropic API; a deployment name you choose on Azure OpenAI; a Bedrock id on AWS), and the **BAA belongs to the provider endpoint**, not the model vendor (GPT on OpenAI API: no BAA; GPT on Azure OpenAI: Microsoft BAA). Keeping *what* (models), *how* (SDK providers) and *where* (hosting) separate means moving production to Azure changes only `hosting/`; routing, tasks and models stay the same.

## 1. How the config fits together

```mermaid
flowchart LR
    classDef policy fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e
    classDef what fill:#ede9fe,stroke:#6d28d9,color:#3b0764
    classDef how fill:#fce7f3,stroke:#be185d,color:#831843
    classDef where fill:#dcfce7,stroke:#15803d,color:#14532d
    classDef future fill:#f1f5f9,stroke:#94a3b8,color:#475569,stroke-dasharray: 5 5
    classDef check fill:#fef3c7,stroke:#b45309,color:#78350f

    subgraph POLICY ["Policy"]
        R["reasoning.ts<br/>Reasoning.Low / Medium / High"]:::policy
        T["tasks.ts<br/>Task.* → min tier, handlesPhi"]:::policy
        RT["routing.ts<br/>profiles: default · budget<br/>tier → ordered models"]:::policy
    end

    subgraph WHAT ["models/ — WHAT"]
        MA["anthropic.ts"]:::what
        MO["openai.ts"]:::what
        MG["google.ts"]:::what
    end

    subgraph HOW ["providers/ — HOW (@ai-sdk/*)"]
        PA["anthropic.ts<br/>BAA ✔"]:::how
        PO["openai.ts<br/>no BAA"]:::how
        PG["google.ts<br/>no BAA"]:::how
        PZ["azure-openai.ts<br/>Microsoft BAA ✔"]:::how
        PB["amazon-bedrock.ts<br/>(future)"]:::future
    end

    subgraph WHERE ["hosting/ — WHERE (app picks ONE)"]
        HD["direct.ts<br/>anthropic + openai + google<br/>claudeOpus55 → claude-opus-5-5"]:::where
        HZ["azure.ts<br/>azure-openai (+ anthropic)<br/>gpt6Astra → your deployment name"]:::where
        HW["aws.ts<br/>(future)"]:::future
    end

    V["validate.ts<br/>every profile × every target:<br/>no empty tier, no deprecated,<br/>BAA model for PHI tiers"]:::check

    R --> T
    R --> RT
    WHAT --> RT
    WHAT --> WHERE
    PA & PO & PG --> HD
    PZ & PA --> HZ
    PB -.-> HW
    T & RT & WHERE --> V
```

## 2. How one call is resolved

```mermaid
flowchart TD
    classDef step fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e
    classDef gate fill:#fee2e2,stroke:#b91c1c,color:#7f1d1d
    classDef ok fill:#dcfce7,stroke:#15803d,color:#14532d

    A["executeAgentObject<br/>task: Task.MedicalCoding<br/>containsPhi, reasoning?"]:::step
    B["Effective tier<br/>max(task min tier, reasoning override)"]:::step
    C["Effective PHI<br/>containsPhi OR task.handlesPhi"]:::step
    D["routing.ts: ordered models for tier<br/>(skip deprecated)"]:::step
    E["hosting target: provider + model id per model<br/>(skip models this target does not host)"]:::step
    F{"PHI?"}:::gate
    G["Keep only providers with baa: true"]:::gate
    X["NoCompliantModelError<br/>no model called"]:::gate
    L["Try model 1 → 2 → …<br/>fall back ONLY on transient errors<br/>(429, 5xx, timeout, network)"]:::step
    OK["Result + audit metadata<br/>agentExecutionId, task, tier, containsPhi,<br/>hostingTarget, endpoint, modelName, modelId, attempts"]:::ok
    ERR["AgentExecutionError<br/>(same metadata, SDK error in cause)"]:::gate

    A --> B --> C --> D --> E --> F
    F -->|yes| G
    F -->|no| L
    G -->|none left| X
    G --> L
    L -->|success| OK
    L -->|non-retryable or chain exhausted| ERR
```

## 3. Choosing where production runs

```mermaid
flowchart LR
    classDef env fill:#fef3c7,stroke:#b45309,color:#78350f
    classDef app fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e
    classDef ext fill:#f1f5f9,stroke:#64748b,color:#334155
    classDef future fill:#f1f5f9,stroke:#94a3b8,color:#475569,stroke-dasharray: 5 5

    ENV[".env per environment<br/>AI_HOSTING_TARGET = direct | azure<br/>AI_ROUTING_PROFILE = default | budget<br/>Azure: resource name, deployment names"]:::env
    CFG["@repo/config parseEnv()"]:::app
    APP["apps/api · apps/worker startup<br/>hosting = directHosting<br/>or createAzureHosting(settings)"]:::app
    GW["createGateway({ hosting, routingProfile })"]:::app

    ENV --> CFG --> APP --> GW
    GW -->|direct| V1["Anthropic API · OpenAI API · Gemini API"]:::ext
    GW -->|azure| V2["Azure OpenAI (Microsoft BAA)<br/>+ Anthropic API (Anthropic BAA)"]:::ext
    GW -.->|aws, future| V3["Amazon Bedrock (AWS BAA)"]:::future
```

`@repo/agents` never reads `process.env`; the app builds the hosting target from its parsed config.

## Calling the gateway

```typescript
import { createGateway, createAzureHosting, Reasoning, Task } from '@repo/agents';

// At app startup (values from @repo/config's parsed env):
const gateway = createGateway({
  routingProfile: 'default',
  hosting: createAzureHosting({
    azureOpenAI: { resourceName: env.AZURE_OPENAI_RESOURCE, tokenProvider }, // Entra ID / managed identity
    deployments: { gpt6Astra: 'prod-gpt6-astra', gpt6Luna: 'prod-gpt6-luna' },
  }),
});

// Per request:
const res = await gateway.executeAgentObject({
  task: Task.MedicalCoding,        // sets minimum tier (High) and PHI policy (always PHI)
  containsPhi: true,               // REQUIRED — does this prompt contain PHI?
  reasoning: Reasoning.High,       // optional: escalate above the task minimum (never lowers it)
  messages,
  schema: CodingSuggestionSchema,
});

res.output;            // schema-typed result
res.agentExecutionId;  // write to @repo/audit with task, tier, hostingTarget, endpoint, modelId, attempts
```

Without `hosting`, the module-level `executeAgentTask` / `executeAgentObject` / `streamAgentTask` use `directHosting` and the `default` profile.

- **Fallback only on transient errors** (408/409/429/5xx/529, network, timeout). Non-retryable errors (400, 401/403, schema/`NoObjectGeneratedError`, aborts, unknown) throw `AgentExecutionError` immediately. The SDK retries the same model first (`maxRetriesPerModel`, default 2).
- **Prompts and outputs are never logged.** Never log `AgentExecutionError.cause` verbatim.
- **Streaming** (`streamAgentTask`) uses the first eligible model only (no mid-stream failover).
- **Settings screen:** `getRoutingOverview({ hosting })` returns each tier's models with label, availability on the target, provider endpoint and BAA flag — no keys or adapters.

## Common changes

**Add a model** — `models/<vendor>.ts`, then a binding in each `hosting/` target that serves it, then use it in `routing.ts`:
```typescript
// models/anthropic.ts   claudeOpus6: { vendor: 'anthropic', label: 'Claude Opus 6', description: '…' }
// hosting/direct.ts     claudeOpus6: { endpoint: 'anthropic', id: 'claude-opus-6' }
// routing.ts            [Reasoning.High]: [Models.claudeOpus6, Models.claudeOpus55, …]
```

**Deploy a GPT model on Azure** — create the deployment in the Azure resource, then add `deployments: { gpt6Sol: '<deployment name>' }` to the app's `createAzureHosting` settings. Nothing in this package changes.

**Retire a model** — set `deprecated: true` in `models/`. `validateAgentConfig()` fails until it is removed from every routing profile.

**Add a task** — add it to `Task` and give it a profile in `TASK_PROFILES` (the compiler rejects a task without one).

**Add a provider / cloud (e.g. AWS Bedrock)**
1. `pnpm --filter @repo/agents add @ai-sdk/amazon-bedrock`
2. `providers/amazon-bedrock.ts` — a factory returning an `Endpoint` (`baa: true` only once the AWS BAA covers the account/region).
3. `hosting/aws.ts` — `createAwsHosting(settings)` binding logical models to Bedrock model ids.
4. Add it to `HOSTING_TARGETS_FOR_VALIDATION` in `hosting/index.ts` so tests prove every routing profile still works — and has a BAA model for PHI tasks — on that cloud.

Validation already runs every routing profile against both `direct` and an **Azure-only** target (no Anthropic), which is how the `budget` profile was found to have no Azure-deployable model for its medium/low tiers (fixed by adding `gpt6Luna`).

## Testing
`createGateway({ hosting, routing, taskProfiles })` accepts injected config. Fixtures (`src/__tests__/fixtures.ts`) define logical models plus two mock hosting targets (a direct-like one and a cloud-like one hosting only Claude under different ids) backed by the SDK's `MockLanguageModelV4` — no API keys, no network.

ADRs: `docs/decisions/2026-09-25-adopt-vercel-ai-sdk-for-agent-orchestration.md`, `docs/decisions/2026-09-25-centralize-agent-configuration-and-model-routing.md`
