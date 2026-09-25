# @repo/agents

This package centralizes all Vercel AI SDK integration, model configuration, routing, and agent fallback logic. By keeping this logic in a shared package, both the `apps/api` (Fastify) and `apps/worker` (BullMQ) can execute AI agent tasks using the exact same configuration without duplicating logic.

## 🧠 Model Routing & Configuration

We use a modular, dependency-inverted architecture for configuring and routing AI models. 

### Architecture Flow

```mermaid
flowchart TD
    %% Colors and Styling
    classDef file fill:#f9f2f4,color:#c7254e,stroke:#c7254e,stroke-width:1px
    classDef logic fill:#e1f5fe,color:#0277bd,stroke:#0277bd,stroke-width:1px
    classDef external fill:#f1f8e9,color:#33691e,stroke:#33691e,stroke-width:1px

    Consumer["Caller: apps/api or apps/worker"] -->|Execute Task| Gateway["gateway.ts"]:::logic
    Gateway -->|Request fallback chain for Tier| Router["router.ts"]:::logic
    
    Router -->|Read Routing Table| ConfigRouting["config/routing.ts"]:::file
    ConfigRouting -.->|returns provider and model keys| Router
    
    Router -->|Lookup Provider| Registry["config/providers/index.ts"]:::file
    
    Registry -->|openai| OpenAICatalog["openai/catalog.ts"]:::file
    Registry -->|anthropic| AnthropicCatalog["anthropic/catalog.ts"]:::file
    Registry -->|azure future| AzureCatalog["azure/catalog.ts"]:::file

    OpenAICatalog -->|getAdapter| VercelOpenAI["Vercel AI SDK: @ai-sdk/openai"]:::external
    AnthropicCatalog -->|getAdapter| VercelAnthropic["Vercel AI SDK: @ai-sdk/anthropic"]:::external
    AzureCatalog -->|getAdapter| VercelAzure["Vercel AI SDK: @ai-sdk/azure"]:::external

    VercelOpenAI --> OpenAIAPI(("OpenAI API"))
    VercelAnthropic --> AnthropicAPI(("Anthropic API"))
    VercelAzure --> AzureAPI(("Azure OpenAI"))
```

### How it Works

The configuration is structured in `src/config/`:

1. **`providers/`**: Each LLM provider (OpenAI, Anthropic, Google) has its own directory. 
   - `constants.ts`: Contains the exact string IDs of the models to prevent typos (e.g., `GPT_6_ASTRA`).
   - `catalog.ts`: Exports a `ProviderCatalog` that lists all models for that provider, their reasoning tier (`high`, `medium`, `low`), and implements a `getAdapter` function.
2. **`types.ts`**: Defines the shared interfaces, including the `ProviderCatalog` which enforces the `getAdapter: (modelId: string) => LanguageModel` method.
3. **`routing.ts`**: Defines the `ROUTING_TABLE`. This maps a `ReasoningTier` to an ordered array of `(provider, modelKey)` fallback entries. If the first model fails with a **transient** error (see retry policy below), the gateway tries the next one in the chain.
4. **`baa` flag**: every `ProviderCatalog` declares `baa: boolean` — whether a signed HIPAA BAA covers that vendor. Current posture: Anthropic `true`; OpenAI `false`; Google `false`. Flip a flag only after the BAA is countersigned (Azure OpenAI will be added as its own provider).

---

## 🔐 Calling the Gateway (PHI, retries, audit)

```ts
import { executeAgentObject } from '@repo/agents';

const { output, agentExecutionId, provider, modelId, attempts } = await executeAgentObject({
  taskType: 'medical-coding',
  complexity: 'high',
  containsPhi: true,          // REQUIRED on every call
  messages,
  schema: CodingSuggestionSchema,
});
// write { agentExecutionId, provider, modelId, attempts, outcome } to @repo/audit — never the prompt/output
```

- **`containsPhi` (required)**: when `true`, the tier's chain is filtered to providers with `baa: true`. If none remain, `NoCompliantModelError` is thrown **before any model is called**. `getRoutingInfo(tier)` exposes `baa` per entry.
- **Effective tier** = the higher of the task-implied tier (`TASK_TIER_MAP`) and the requested `complexity`. Deprecated models are skipped.
- **Retry / fallback policy** (`isRetryableModelError` in `src/errors.ts`): the SDK first retries the same model (`maxRetriesPerModel`, default 2, with backoff). The gateway then falls back to the next eligible model **only** for transient failures — HTTP 408/409/429/5xx (incl. 529 overloaded), network errors, timeouts. Non-retryable errors (400, 401/403, 404, schema/validation such as `NoObjectGeneratedError`, aborts, unknown errors) fail immediately, so a request is never fanned out to extra vendors.
- **Results**: every call returns `AgentExecutionMeta` — `agentExecutionId` (UUID), `tier`, `containsPhi`, `provider`, `modelKey`, `modelId`, `attempts` (models tried) — alongside `result` (`executeAgentTask`: the `generateText` result; `streamAgentTask`: the `streamText` result, returned synchronously, primary model only) or `output` (`executeAgentObject<T>`: typed `T`).
- **Failures** throw `AgentExecutionError` carrying `agentExecutionId`, `attempts`, `lastProvider`, `lastModelId`, `retryable`; the SDK error is its `cause`. Do not log `cause` verbatim — some SDK errors embed request bodies or model output.
- **No prompt/output logging** happens in this package. `streamAgentTask` replaces the SDK's default `console.error` stream error handler with a no-op (override via `onError`).
- **Tools**: pass `tools` and `maxSteps` (mapped to the SDK v7 `stopWhen: isStepCount(n)`).
- **Testing**: `createGateway({ registry, routing, maxRetriesPerModel, generateExecutionId })` builds a gateway over an injected registry (see `src/__tests__/fixtures.ts`, using `MockLanguageModelV4` from `ai/test`). Run `pnpm --filter @repo/agents test`.

### The Dependency Inversion Principle
Notice that `src/router.ts` **does not** import `@ai-sdk/openai` or any other provider directly. It simply resolves the requested model from the `PROVIDER_REGISTRY` and calls `catalog.getAdapter(modelId)`. The actual initialization of the Vercel AI adapter happens natively inside each provider's `catalog.ts` file.

---

## 🚀 Future Deployments (Azure OpenAI / AWS Bedrock)

This modular setup is designed to be **100% compatible** with enterprise cloud providers like Azure OpenAI or AWS Bedrock. You will not need to rewrite the router or the gateway.

### Steps to Add Azure or AWS:

When you are ready to deploy to Azure (using `@ai-sdk/azure`) or AWS (`@ai-sdk/amazon-bedrock`), follow these exact steps:

1. **Install the adapter:**
   ```bash
   pnpm add @ai-sdk/azure --filter @repo/agents
   ```
2. **Add Provider Type:**
   In `src/config/types.ts`, add `'azure'` to the `ProviderName` type:
   ```typescript
   export type ProviderName = 'openai' | 'anthropic' | 'google' | 'azure';
   ```
3. **Create Provider Directory:**
   Create a new folder `src/config/providers/azure/`.
   - Create `constants.ts` with your custom Azure deployment names.
   - Create `catalog.ts` and initialize the adapter:
   ```typescript
   import { createAzure } from '@ai-sdk/azure';
   import { AZURE_MODELS } from './constants.js';
   import { type ProviderCatalog } from '../../types.js';

   // Initialize the Azure client (it will automatically pick up AZURE_API_KEY and AZURE_RESOURCE_NAME from the environment)
   const azure = createAzure();

   export const AZURE_CATALOG: ProviderCatalog = {
     displayName: 'Azure OpenAI',
     providerKey: 'azure',
     baa: true, // ONLY once the Microsoft BAA covering this Azure resource is signed
     models: { /* ... */ },
     getAdapter: (modelId) => azure(modelId),
   };
   ```
4. **Register Provider:**
   Export it in `src/config/providers/index.ts` and add `AZURE_CATALOG` to the `PROVIDER_REGISTRY`.
5. **Update Routing:**
   In `src/config/routing.ts`, swap out the default OpenAI/Anthropic models for your Azure models in the `ROUTING_TABLE`.

Because of the dependency-inverted architecture, `router.ts` will instantly pick up the new Azure adapter without any code changes required in the routing logic itself.
