---
status: accepted
date: 2026-09-25
decision-makers: Engineering Team
---

# Multi-Environment Lifecycle and Deployment Strategy (Dev, Staging, Production)

## Context and Problem Statement

The ASC EHR platform is a mission-critical electronic health record system incorporating autonomous agentic workflows (via Vercel AI SDK), a Fastify API, BullMQ background workers, and a Next.js web application within a Turborepo monorepo.

Currently, the codebase has only basic configurations (`.env.example` with `NODE_ENV=development`). There is no defined structure or mechanism for:
1. **Environment Separation**: Distinct configurations and secrets for **Development**, **Staging**, and **Production**.
2. **Testing & Staging Suitability**: Testing agentic LLM workflows in Staging without incurring unsustainable API costs, violating HIPAA regulations, or suffering from non-deterministic test failures.
3. **Environment Selectability**: Easily switching between environments locally, in CI/CD, and during cloud deployments.

We need an architectural blueprint and operating model for managing the development-to-production promotion lifecycle.

## Decision

We establish a three-tier environment model with strict isolation, centralized environment validation, and agent virtualization for staging:

### 1. The Three Tiers

| Dimension | Development (`dev`) | Staging (`staging`) | Production (`production`) |
| :--- | :--- | :--- | :--- |
| **Purpose** | Rapid local developer iteration | Full integration testing, agent evaluation, UAT | Clinical ASC operations |
| **Infrastructure** | Local machine / Docker Compose | Isolated cloud staging environment (mirror of prod) | Multi-AZ high-availability HIPAA VPC |
| **Data** | Synthetic seed data | Anonymized / synthetic high-volume test data | Live encrypted PHI (HIPAA compliant, BAA) |
| **LLM Tiering** | Low-cost models or mock fixtures | Cost-capped models & evaluation test fixtures | Full multi-provider reasoning fallback chain |
| **API Keys** | Developer personal / sandbox keys | Staging organization keys (spend-capped) | Production enterprise keys with strict BAA |

### 2. Centralized Environment Configuration (`@repo/config/env`)
Instead of raw `process.env` access, all apps will consume a validated environment contract defined in `@repo/config`:
- An explicit `APP_ENV` variable with values: `'development' | 'staging' | 'production'`.
- Zod schemas validating all database URLs, Redis URLs, and API keys at boot time.
- Failure to provide valid keys in Staging or Production results in immediate fast-fail at process startup.

### 3. Agentic & LLM Staging Strategy
Because ASC EHR is agent-driven, Staging has special requirements:
1. **Zero PHI in LLMs**: No real patient health information is ever processed in Dev or Staging.
2. **Virtualization & Deterministic Testing**: Staging automated test suites will utilize recorded LLM fixtures or Vercel AI SDK `MockLanguageModel` for regression testing to eliminate API costs and flake.
3. **Environment-Aware Model Routing**: In `packages/agents`, routing will support staging overrides (e.g., routing `medical-coding` in staging to fast/efficient models like Gemini 3.8 Flash or Claude Haiku unless explicitly running a formal evaluation suite).

### 4. Selectability Mechanism
Environments are selected via:
- **Local/CLI**: `APP_ENV=staging pnpm dev` or `--env-file=.env.<env>` (Node 20+ native).
- **Turborepo**: Root scripts (`pnpm start:staging`, `pnpm start:prod`) and env pass-through in `turbo.json`.
- **Containers**: Multi-target Dockerfiles supporting `development`, `staging`, and `production` stages.

## Consequences

- **Good**: Eliminates configuration drift and prevents staging mistakes from spilling into production.
- **Good**: Protects against unexpected LLM API bills during continuous integration and QA testing.
- **Good**: Guarantees HIPAA compliance by enforcing complete data isolation between staging and production.
- **Good**: Startup crashes occur immediately if required environment secrets are missing, rather than failing mid-transaction.
- **Bad**: Requires maintaining separate secrets and seed data sets for Staging and Production.

## Implementation Plan

- **Affected paths**:
  - `packages/config/src/env/`: Zod environment validation schemas.
  - `packages/agents/src/config/`: Environment-aware routing overrides for Staging/Dev.
  - `apps/api/`, `apps/worker/`, `apps/web/`: Adopting validated env schemas and env files (`.env.staging.example`, `.env.production.example`).
  - `.github/workflows/`: CI/CD pipelines targeting Staging on `staging` branch and Production on tagged releases.
- **Patterns to follow**:
  - Never access `process.env` directly in application logic; use the validated config export.
  - Keep synthetic clinical seed data versioned and isolated from production.

### Verification

- [x] Document environment strategy and guidelines in `docs/ENVIRONMENTS_AND_DEPLOYMENT.md`.
- [x] Record ADR in `docs/decisions/`.
- [x] Create example environment files for staging and production.
