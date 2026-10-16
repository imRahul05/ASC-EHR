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
export { subscriberRelationshipSchema, type SubscriberRelationship } from "./patient.js";
export {
  bookCaseSchema as legacyBookCaseSchema,
  procedureIntentSchema as legacyProcedureIntentSchema,
  procedureCodeSchema,
  CASE_DURATIONS_MIN,
  localDateTimeToIso,
  bookCasePayloadFrom,
  type BookCaseFormData,
  getScheduleQuerySchema,
  type GetScheduleQuery,
} from "./schedule.js";
export * from "./cases/book.js";
export * from "./cases/transition.js";

// Informed consent and pre-op nursing intake contracts (Phase P17)
export * from "./consent.js";
export * from "./preop.js";

// H&P update note, override, and anticoagulation contracts (Phase P16)
export * from "./hp.js";
export * from "./anticoagulation.js";

// Principal, grants, role templates and GET /me (authorization contracts)
export * from "./authz.js";

// Patient intake, registration, and duplicate search (Phase P14)
export * from "./patients/coverage.js";
export * from "./patients/register.js";
export * from "./patients/search.js";

// Validation error formatting and guards (LM-001)
export * from "./errors.js";

// Financial clearance, eligibility, and estimate contracts (Phase P22a)
export * from "./financial/index.js";

// Intra-op room capture, timeout, scope lock & Gate 2 override contracts (Phase P18)
export * from "./procedure-capture.js";
