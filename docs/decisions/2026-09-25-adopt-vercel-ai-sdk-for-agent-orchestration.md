---
status: accepted
date: 2026-09-25
decision-makers: 
---

# Adopt Vercel AI SDK for Agent Orchestration

## Context and Problem Statement

The ClinIQ ASC EHR requires intelligent multi-agent and single-agent workflows to handle tasks like AI medical scribing, CPT/ICD-10 coding from notes, and pre-op readiness checks. To manage costs and latencies, we need the flexibility to route different tasks to differently capable foundation models (e.g., using a cheaper, faster model for simple extraction, and a high-reasoning model for medical coding). 

We need a standardized orchestration layer that:
1. Abstracts away the differences between major LLM providers (OpenAI, Anthropic, Google).
2. Enforces strictly typed outputs required for FHIR compliance.
3. Provides first-class support for streaming to React UIs (`apps/web`).

## Decision

We will adopt the **Vercel AI SDK** (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`) as the exclusive foundation for all agent orchestration. 

We will create a centralized gateway in the `@asc/agents` package that handles model routing and encapsulates standard tool executions. Agents will use the `tool` function provided by the SDK to interface securely with Medplum FHIR CRUD operations.

**Non-goals**: We are not adopting complex state machine orchestrators (like LangGraph) for now; the Vercel AI SDK's multi-step capabilities will handle conversational memory and multi-step tool calls natively.

## Consequences

- Good, because we avoid vendor lock-in. Switching a provider is as easy as changing a string parameter.
- Good, because it enables a "Model & Complexity Router" to dynamically choose models based on the task type (e.g., GPT-4o vs Gemini 1.5 Flash), drastically reducing API costs.
- Good, because we can share typed FHIR tool definitions across the frontend and backend uniformly.
- Bad, because updates to the Vercel AI SDK often carry breaking changes requiring careful migrations (e.g., the transition from v3 to v4/v7).

## Implementation Plan

- **Affected paths**: 
  - `packages/agents/src/router.ts` (Model router)
  - `packages/agents/src/gateway.ts` (Core execution wrappers)
  - `packages/agents/src/tools/` (FHIR and Medplum tools)
- **Dependencies**: Add `ai`, `zod`, and specific `@ai-sdk/*` providers to `packages/agents`.
- **Patterns to follow**:
  - All LLM calls must go through the functions exposed in `packages/agents/src/gateway.ts` (`executeAgentTask`, `streamAgentTask`, `executeAgentObject`) rather than calling providers directly.
  - Strict type checking (`unknown` instead of `any`) for return types of the orchestration wrappers.
- **Patterns to avoid**: 
  - Do not call the OpenAI/Anthropic/Google native SDKs directly. Use the `@ai-sdk/*` adapters.

### Verification

- [x] Create `@asc/agents` package with the routing logic.
- [x] Configure standard Vercel AI SDK tool definitions for Medplum FHIR resources.
- [ ] Connect the agent gateway to a Medplum Bot (asynchronous workflow).
- [ ] Connect the agent gateway to a Next.js Server Action (synchronous UI workflow).

## More Information

- Vercel AI SDK Documentation: https://sdk.vercel.ai/docs
