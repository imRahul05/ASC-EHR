# ASC EHR Architecture

## Core Philosophy: Centralization & Zero Duplication

This monorepo is designed to completely eliminate code and dependency duplication across the frontend, backend, and background workers. 

Every piece of reusable logic, typing, or configuration **must** be extracted into a package inside `/packages`. 

### The Applications (`/apps`)
1. **`apps/web` (Next.js)**: The user interface. It should **only** contain UI rendering logic, routing, and state. It must *never* redefine types, API clients, or validation schemas.
2. **`apps/api` (Fastify)**: The backend API. It handles HTTP requests, SSE streaming, and caching. It must *never* redefine types or validation schemas.
3. **`apps/worker` (BullMQ/Redis)**: The background job processor. It handles heavy operations offloaded from the API.

### The Packages (`/packages`)
All shared logic acts as the single source of truth:
- **`@asc/ui`**: Centralized UI components (shadcn + Base UI). Do not install UI libraries directly in `apps/web`.
- **`@asc/clinical-rules`**: Pure domain engines (Hard Gates 1/2/3, ASGE anticoagulation holds, BBPS, Aldrete scoring, scheduling conflicts, financial GFE/eligibility).
- **`@asc/fhir`**: Pure isomorphic FHIR R4 builders, extension URLs, CodeSystems, and ValueSets.
- **`@asc/authz`**: Capability catalog, role templates, access policies, and permission compiler.
- **`@asc/validation`**: Centralized Zod schemas. Both `apps/web` (for forms) and `apps/api` (for request validation) use exactly the same schemas from here.
- **`@asc/types`**: Centralized TypeScript definitions and `API_ERROR_CODES` dictionary.
- **`@asc/api-client`**: Centralized fetching logic and TanStack React Query hooks.
- **`@asc/config`**: Centralized constants and environment variables mapping (incl. queue names and producer job options).
- **`@asc/agents`**: The only place LLMs are called: agents, model routing, gateway, context and run-state interfaces.
- **`@asc/db`**: Postgres (Drizzle) schema, migrations and store implementations (e.g. agent run store).
- **`@asc/audit` / `@asc/logger` / `@asc/telemetry`**: Compliance audit trail, PHI-redacting logs, tracing.

### Key Architecture Documents
- **[Master Architecture & Technology Stack](../README.md#master-architecture--technology-stack)**: Full system diagram and layer interactions.
- **[Target Clinical Architecture](product/03-target-architecture.md)**: Perioperative continuum, system context, and Medplum primitives.
- **[Agent Architecture Guidelines](agent/architecture.md)**: Strict monorepo boundaries and coding conventions.
- **[Clinical Safety & Stage vs Readiness](product/09-clinical-safety-and-stage-readiness.md)**: Decoupled stage machine and 3 Hard Gates.

### Rule of Thumb for Agents / Developers
> **If you are about to write a TypeScript interface, a Zod schema, or a generic utility function inside `/apps/*`, STOP.** Put it in the appropriate `/packages/*` workspace instead.
