# ASC EHR - Agent Knowledge Base

## Project Overview
ASC EHR is a monorepo application using a modern tech stack focused on high performance, strict type safety, and minimal unnecessary abstractions.

## Architecture & Conventions

### 1. Monorepo (Turborepo + pnpm)
- Managed with `pnpm` workspaces and Turborepo (`turbo.json`).
- Root commands: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`.
- **Apps**: Live in `/apps` (`web`, `api`, `worker`).
- **Packages**: Live in `/packages` (`ui`, `types`, `validation`, `api-client`, `config`).

### 2. Frontend (`apps/web`)
- **Next.js**: Latest version, App Router, TypeScript.
- **Styling**: Tailwind CSS v4.
- **UI Components**: Shared from `packages/ui` using shadcn (configured with Base UI, **NOT** Radix UI).
- Uses `Turbopack` for development.

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

### 6. Official Setup
- The repository was scaffolded using the official Turborepo, Next.js, and shadcn CLIs directly to maintain standard defaults and optimizations.
