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

---

## Composite Route Pre-Handler Pipelines (`apps/api`)

Fastify route definitions for clinical case resources (`/cases/:caseId/*`) must **never** configure raw, ad-hoc arrays of preHandler hooks. Raw arrays lead to hook ordering vulnerabilities (e.g., executing idempotency cache lookups or body validation before authorization checks, risking unauthorized resource enumeration under HIPAA 45 CFR § 164.312(a)(1) or cache pollution).

Instead, all clinical mutations and queries use composite pipeline factories (`apps/api/src/hooks/pipeline.ts`).

### Canonical Pipeline Sequences

#### 1. Clinical Mutation Pipeline (`createClinicalMutationPipeline`)
Enforces the 5-step fail-closed execution order:
1. **Gate 3 & 4 Capability Verification (`requireCapabilityHook`)**: Validates that the authenticated principal possesses the required capability at the target facility. Rejects unauthorized requests immediately with HTTP 403 `forbidden` before performing database lookups.
2. **Idempotency Replay (`requireIdempotency`)**: Checks for an existing cached response using the `Idempotency-Key` or `x-idempotency-key` header. If a cached response exists, marks `request.facilityChecked = true` and replays the response immediately with HTTP 200/201.
3. **Optimistic Locking Header (`requireIfMatchHeader`)**: If `enforceIfMatch: true` is configured, verifies that an `If-Match` header is present. Rejects missing headers with HTTP 400 `bad_request`.
4. **Case Context Hydration (`requireCaseContext`)**: Resolves and verifies that the `caseId` FHIR Encounter exists and belongs to the active `facilityId`. Also verifies ETag version concurrency if `If-Match` is provided (rejecting version mismatches with HTTP 409 `concurrency_conflict`).
5. **Zod Body Validation (`validateBody`)**: Validates and parses the request payload against the provided schema from `@asc/validation`, safely attaching typed data to `request.body`.

#### 2. Clinical Query Pipeline (`createClinicalQueryPipeline`)
Enforces the 3-step execution order:
1. **Gate 3 & 4 Capability Verification (`requireCapabilityHook`)**: Validates the caller's read capability before accessing clinical data.
2. **Case Context Hydration (`requireCaseContext`)**: Loads the authorized case context and verifies tenant/facility isolation.
3. **Zod Query Validation (`validateQuery`)**: Validates query parameters against domain schema (if provided).

### Example Usage

```typescript
import { API_ROUTE_PATTERNS } from "@asc/config";
import { signConsentSchema } from "@asc/validation";
import type { FastifyInstance } from "fastify";
import { capabilityAtResource } from "../auth/route-auth.js";
import { consentController } from "../controllers/consent.controller.js";
import {
  createClinicalMutationPipeline,
  createClinicalQueryPipeline,
} from "../hooks/pipeline.js";

export function consentRoutes(app: FastifyInstance): Promise<void> {
  // Mutation route with capability check, idempotency, case hydration, and body validation
  app.post(
    API_ROUTE_PATTERNS.caseConsent,
    {
      config: capabilityAtResource("consent.collect"),
      preHandler: createClinicalMutationPipeline({
        capability: "consent.collect",
        schema: signConsentSchema,
        errorMessage: "Invalid consent payload.",
      }),
    },
    (request, reply) => consentController.signConsent(request, reply)
  );

  // Query route with capability check and case hydration
  app.get(
    API_ROUTE_PATTERNS.caseConsent,
    {
      config: capabilityAtResource("case.read"),
      preHandler: createClinicalQueryPipeline({ capability: "case.read" }),
    },
    (request, reply) => consentController.getConsent(request, reply)
  );

  return Promise.resolve();
}
```

