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
- **`@repo/ui`**: Centralized UI components (shadcn + Base UI). Do not install UI libraries directly in `apps/web`.
- **`@repo/validation`**: Centralized Zod schemas. Both `apps/web` (for forms) and `apps/api` (for request validation) use exactly the same schemas from here.
- **`@repo/types`**: Centralized TypeScript definitions.
- **`@repo/api-client`**: Centralized fetching logic. 
- **`@repo/config`**: Centralized constants and environment variables mapping.

### Rule of Thumb for Agents / Developers
> **If you are about to write a TypeScript interface, a Zod schema, or a generic utility function inside `/apps/*`, STOP.** Put it in the appropriate `/packages/*` workspace instead.
