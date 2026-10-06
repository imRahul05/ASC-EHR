import { z } from "zod";

// Shared schemas for frontend and backend.
// Browser code (apps/web, @asc/api-client) imports the leaf subpaths
// ("@asc/validation/auth", ...) — Turbopack cannot follow the NodeNext ".js"
// re-exports below. Node packages may import this root entry.
export const baseSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});


// GET /health — shared by apps/api (response) and @asc/api-client (parsing)
export * from "./health.js";

// AI agent outputs (@asc/agents) — returned by apps/api, rendered by apps/web
export * from "./agents/discharge-instructions.js";

// Background job contracts — enqueued by apps/api, processed by apps/worker
export * from "./jobs.js";

// Authentication: login and access requests
export * from "./auth.js";

// API error body
export * from "./api-error.js";

// Front desk: patient registration and case booking forms
export * from "./patient.js";
export * from "./schedule.js";

// Principal, grants, role templates and GET /me (authorization contracts)
export * from "./authz.js";
