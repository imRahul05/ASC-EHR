# Monorepo Architecture & Agent Conventions

## 🛑 STRICT RULES FOR AI AGENTS (ANTI-DUPLICATION & CENTRALIZATION)
Read this before writing any code. The sole purpose of this monorepo is **centralization**.

1. **NO DUPLICATE CODE OR TYPES:** Do not define the same interface, type, or Zod schema in `apps/web` and `apps/api`. All shared types must go to `packages/types`. All shared validation must go to `packages/validation`.
2. **NO DUPLICATE DEPENDENCIES:** Do not install UI libraries in `apps/web`. UI components must live in `packages/ui` (shadcn + Base UI + Tailwind v4) and be imported into the web app.
3. **NO DUPLICATE LOGIC:** If frontend and backend need the same utility, put it in a shared package (e.g., `packages/config` or `packages/api-client`).
4. **SINGLE SOURCE OF TRUTH:** `/packages` is the center. `/apps` simply consume from `/packages`.
5. **CENTRALIZED CONFIGURATION (NO ENV FOR CONSTANTS):** Do not scatter configuration strings (like LLM model names, feature flags, or non-sensitive settings) across files or hide them in `.env`. Put them in a centralized exported config directory (e.g., `packages/agents/src/config/`). This ensures easy maintenance and allows the frontend to import the config.
6. **RESPECT ARCHITECTURE DECISIONS:** Always read the Architecture Decision Records (ADRs) in `docs/decisions/` before making architectural changes or creating new agent workflows. When you make an architectural decision, use the `adr-skill` to create a new ADR.
7. **COMPLIANCE & PHI HANDLING:** Never expose or log raw Protected Health Information (PHI). All data access must be audit-logged, and all code must adhere to HIPAA and SOC 2 standards. Read the full guidelines at [`docs/COMPLIANCE_AND_PHI.md`](../COMPLIANCE_AND_PHI.md).

*See `docs/ARCHITECTURE.md` for the architectural diagram and breakdown.*

---

## Architecture & Conventions

### 1. Monorepo (Turborepo + pnpm)
- Managed with `pnpm` workspaces and Turborepo (`turbo.json`).
- Root commands: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`.
- **Apps**: Live in `/apps` (`web`, `api`, `worker`).
- **Packages**: Live in `/packages` (`ui`, `types`, `validation`, `api-client`, `config`).

### 2. Frontend (`apps/web`)
- **Next.js**: Latest version, App Router, TypeScript (v7).
- **Styling**: Tailwind CSS v4.
- **UI Components**: Shared from `packages/ui` using shadcn (Base UI, **NOT** Radix).

### 3. Backend (`apps/api`)
- **Framework**: Fastify (latest stable).
- **Validation**: Zod (shared with frontend via `packages/validation`).
- **Patterns**: No NestJS, no decorators, no classes for dependency injection. We use pure functions, simple module imports, and Fastify plugins.
- **Structure**: `routes/` for HTTP endpoints, `schemas/` for Zod/JSON schemas, `services/` for pure business logic.
- **SSE Support**: Server-Sent Events are supported for real-time capabilities.

### 4. Background Jobs (`apps/worker`)
- **Queueing**: BullMQ backed by Redis.
- **Responsibilities**: Dedicated node process for offloading heavy, asynchronous, or scheduled background tasks from the API.

### 5. Shared Packages Boundaries
- **Server/Client Boundaries**: Packages like `ui` and `api-client` are designed for browser/Node usage. Packages containing sensitive logic or Node-only APIs should never be imported by the Next.js client bundle.
- **Strict TypeScript**: `any` is banned. Use `unknown` or proper types.
