# Centralized Error Handling & Fastify API Layering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize API error codes, response payloads, and HTTP error handling into `@asc/types`, introduce a type-safe Fastify error handler and `reply.sendApiError(...)` wrapper, and segregate `apps/api` into clean architectural layers (Routes ➔ Pre-handler Hooks ➔ Controllers ➔ Services) to eliminate boilerplate while maintaining 100% test pass and mock parity.

**Architecture:** Define a single source of truth for error codes and default messages in `@asc/types` (`API_ERROR_CODES`, `API_ERROR_REGISTRY`). Introduce a Fastify plugin in `apps/api` with `reply.sendApiError(...)` and a global error handler that automatically catches Zod validation failures. Segregate `/cases/:caseId/*` handling into reusable `requireCaseContext` and `validateBody` hooks, dedicated controllers in `apps/api/src/controllers/`, and thin declarative route registrations in `apps/api/src/routes/`. Update MSW mock helpers in `apps/web/src/mocks` to consume the same error codes.

**Tech Stack:** Fastify 5.x, TypeScript 5.x (Strict), Zod 3.x, `@medplum/fhirtypes`, Vitest, MSW 2.x.

**Spec:**
- Fastify API Engineering principles (`.claude/skills/api-design/SKILL.md`)
- HIPAA Audit & Error Logging Guidelines (45 CFR § 164.312(b))
- ASC EHR Architecture Guidelines (`docs/agent/architecture.md`)
- Corrected mistakes: LM-001 (no Zod in types), LM-004 (token in memory), LM-012 (shared config in config package), LM-026 (Zod error format in ApiErrorPayload).

## Global Constraints
- Absolute ban on `any` and `unknown` types across all packages and apps (strict user global rules).
- No TypeScript `enum` declarations; use `as const` object maps and string union types.
- Error codes must preserve existing string values (`"invalid_payload"`, `"facility_required"`, `"invalid_case_id"`, `"not_found"`, `"GATE_FAILED"`, `"conflict"`, `"forbidden"`) to avoid breaking existing clients and tests.
- Response payloads must strictly conform to `ApiErrorPayload` in `@asc/types`: `{ code?: string; message?: string; details?: Record<string, string>; duplicateMatch?: DuplicateMatchResult; reasons?: readonly ConflictReason[] }`.
- In async Fastify hooks, every error send must explicitly `return` (e.g. `return reply.sendApiError(...)`) to prevent `FST_ERR_REP_ALREADY_SENT`.
- Zero lint warnings (`eslint --max-warnings 0`) and clean TypeScript compilation (`tsc --noEmit`).

## Review Focus
- **Input with missing `x-facility-id` header**: Hook must return HTTP 400 with `{ code: "facility_required", message: "Facility context is required" }` and short-circuit before database queries.
- **Malformed case ID (non-FHIR regex)**: Hook must return HTTP 400 with `{ code: "invalid_case_id", message: "Invalid case ID format" }` and short-circuit.
- **Non-existent or cross-tenant Case ID**: Hook must return HTTP 404 with `{ code: "not_found", message: "Case {id} not found..." }`.
- **Invalid request body (Zod parse failure)**: Must return HTTP 400 with canonical `{ code: "invalid_payload", message: "Invalid request payload.", details: Record<string, string>, issues: [...] }` without double-nesting `details.details`.
- **Double reply execution in hooks**: Hook must halt execution and never trigger `FST_ERR_REP_ALREADY_SENT` when replying with an error.

---

### Task 1: Centralized Error Catalog in `@asc/types`

**Files:**
- Create: `packages/types/src/errors.ts`
- Modify: `packages/types/src/index.ts`
- Modify: `packages/types/package.json`
- Test: `packages/types/src/errors.test.ts`

**Interfaces:**
- Produces: `API_ERROR_CODES`, `API_ERROR_REGISTRY`, `type ApiErrorCode`, `type ErrorDefinition`.

- [ ] **Step 1: Write the failing test for error constants and registry**

Create `packages/types/src/errors.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { API_ERROR_CODES, API_ERROR_REGISTRY, type ApiErrorCode } from "./errors.js";

describe("API_ERROR_CODES and API_ERROR_REGISTRY", () => {
  it("defines standard error codes with expected string literals", () => {
    expect(API_ERROR_CODES.INVALID_PAYLOAD).toBe("invalid_payload");
    expect(API_ERROR_CODES.FACILITY_REQUIRED).toBe("facility_required");
    expect(API_ERROR_CODES.INVALID_CASE_ID).toBe("invalid_case_id");
    expect(API_ERROR_CODES.NOT_FOUND).toBe("not_found");
    expect(API_ERROR_CODES.GATE_FAILED).toBe("GATE_FAILED");
    expect(API_ERROR_CODES.CONFLICT).toBe("conflict");
    expect(API_ERROR_CODES.FORBIDDEN).toBe("forbidden");
    expect(API_ERROR_CODES.UNAUTHENTICATED).toBe("unauthenticated");
  });

  it("contains registry entries for every defined error code with valid HTTP status", () => {
    const codes = Object.values(API_ERROR_CODES) as readonly ApiErrorCode[];
    for (const code of codes) {
      const def = API_ERROR_REGISTRY[code];
      expect(def, `Missing registry definition for code: ${code}`).toBeDefined();
      expect(typeof def.status).toBe("number");
      expect(def.status >= 400 && def.status <= 599).toBe(true);
      expect(typeof def.defaultMessage).toBe("string");
      expect(def.defaultMessage.length).toBeGreaterThan(0);
    }
  });

  it("maps status codes accurately", () => {
    expect(API_ERROR_REGISTRY[API_ERROR_CODES.INVALID_PAYLOAD].status).toBe(400);
    expect(API_ERROR_REGISTRY[API_ERROR_CODES.FACILITY_REQUIRED].status).toBe(400);
    expect(API_ERROR_REGISTRY[API_ERROR_CODES.UNAUTHENTICATED].status).toBe(401);
    expect(API_ERROR_REGISTRY[API_ERROR_CODES.FORBIDDEN].status).toBe(403);
    expect(API_ERROR_REGISTRY[API_ERROR_CODES.NOT_FOUND].status).toBe(404);
    expect(API_ERROR_REGISTRY[API_ERROR_CODES.GATE_FAILED].status).toBe(409);
    expect(API_ERROR_REGISTRY[API_ERROR_CODES.INTERNAL_ERROR].status).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @asc/types test`
Expected: FAIL with module `./errors.js` not found.

- [ ] **Step 3: Implement `packages/types/src/errors.ts`**

Implement `API_ERROR_CODES`, `API_ERROR_REGISTRY`, `type ApiErrorCode`, and `type ErrorDefinition` as pure TypeScript definitions without external dependencies:
```ts
export const API_ERROR_CODES = {
  INVALID_PAYLOAD: "invalid_payload",
  INVALID_QUERY: "invalid_query",
  FACILITY_REQUIRED: "facility_required",
  INVALID_CASE_ID: "invalid_case_id",
  INVALID_ROOM: "invalid_room",
  INACTIVE_PRACTITIONER: "inactive_or_invalid_practitioner",
  BAD_REQUEST: "bad_request",
  UNAUTHENTICATED: "unauthenticated",
  FORBIDDEN: "forbidden",
  FACILITY_ACCESS_DENIED: "facility_access_denied",
  NOT_FOUND: "not_found",
  PATIENT_NOT_FOUND: "patient_not_found",
  PRIMARY_PHYSICIAN_NOT_FOUND: "primary_physician_not_found",
  ANESTHESIOLOGIST_NOT_FOUND: "anesthesiologist_not_found",
  CONFLICT: "conflict",
  GATE_FAILED: "GATE_FAILED",
  IDEMPOTENCY_KEY_CONFLICT: "idempotency_key_conflict",
  DUPLICATE_MRN_CONFLICT: "duplicate_mrn_conflict",
  DUPLICATE_PATIENT_DETECTED: "duplicate_patient_detected",
  RATE_LIMITED: "rate_limited",
  INTERNAL_ERROR: "internal_error",
  INCOMPLETE_TRANSACTION: "incomplete_transaction",
  UNAVAILABLE: "unavailable",
  UPSTREAM_SERVICE_UNAVAILABLE: "upstream_service_unavailable",
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

export interface ErrorDefinition {
  readonly status: number;
  readonly defaultMessage: string;
}

export const API_ERROR_REGISTRY: Record<ApiErrorCode, ErrorDefinition> = {
  [API_ERROR_CODES.INVALID_PAYLOAD]: { status: 400, defaultMessage: "Invalid request payload." },
  [API_ERROR_CODES.INVALID_QUERY]: { status: 400, defaultMessage: "Invalid request query parameters." },
  [API_ERROR_CODES.FACILITY_REQUIRED]: { status: 400, defaultMessage: "Facility context is required." },
  [API_ERROR_CODES.INVALID_CASE_ID]: { status: 400, defaultMessage: "Invalid case ID format." },
  [API_ERROR_CODES.INVALID_ROOM]: { status: 400, defaultMessage: "Specified room is invalid or unsupported." },
  [API_ERROR_CODES.INACTIVE_PRACTITIONER]: { status: 400, defaultMessage: "Practitioner is inactive or invalid." },
  [API_ERROR_CODES.BAD_REQUEST]: { status: 400, defaultMessage: "Bad request." },
  [API_ERROR_CODES.UNAUTHENTICATED]: { status: 401, defaultMessage: "Authentication required." },
  [API_ERROR_CODES.FORBIDDEN]: { status: 403, defaultMessage: "You do not have access to this resource." },
  [API_ERROR_CODES.FACILITY_ACCESS_DENIED]: { status: 403, defaultMessage: "Resource is not associated with this facility." },
  [API_ERROR_CODES.NOT_FOUND]: { status: 404, defaultMessage: "Resource not found." },
  [API_ERROR_CODES.PATIENT_NOT_FOUND]: { status: 404, defaultMessage: "Patient not found." },
  [API_ERROR_CODES.PRIMARY_PHYSICIAN_NOT_FOUND]: { status: 404, defaultMessage: "Primary physician not found." },
  [API_ERROR_CODES.ANESTHESIOLOGIST_NOT_FOUND]: { status: 404, defaultMessage: "Anesthesiologist not found." },
  [API_ERROR_CODES.CONFLICT]: { status: 409, defaultMessage: "A conflict occurred while processing the request." },
  [API_ERROR_CODES.GATE_FAILED]: { status: 409, defaultMessage: "Clinical gate rejected the transition." },
  [API_ERROR_CODES.IDEMPOTENCY_KEY_CONFLICT]: { status: 409, defaultMessage: "Idempotency key was used with conflicting parameters." },
  [API_ERROR_CODES.DUPLICATE_MRN_CONFLICT]: { status: 409, defaultMessage: "A patient with this MRN already exists at this facility." },
  [API_ERROR_CODES.DUPLICATE_PATIENT_DETECTED]: { status: 409, defaultMessage: "Potential duplicate patient detected." },
  [API_ERROR_CODES.RATE_LIMITED]: { status: 429, defaultMessage: "Too many requests. Please try again later." },
  [API_ERROR_CODES.INTERNAL_ERROR]: { status: 500, defaultMessage: "Internal server error." },
  [API_ERROR_CODES.INCOMPLETE_TRANSACTION]: { status: 500, defaultMessage: "Incomplete transaction. Manual reconciliation required." },
  [API_ERROR_CODES.UNAVAILABLE]: { status: 503, defaultMessage: "Service temporarily unavailable." },
  [API_ERROR_CODES.UPSTREAM_SERVICE_UNAVAILABLE]: { status: 503, defaultMessage: "Upstream clinical data service is temporarily unavailable." },
};
```

Export `* from "./errors.js"` in `packages/types/src/index.ts` and add `"./errors": "./src/errors.ts"` to `package.json` exports.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @asc/types test`
Expected: PASS with 100% test coverage.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/errors.ts packages/types/src/errors.test.ts packages/types/src/index.ts packages/types/package.json
git commit -m "feat(types): centralize API error codes and registry dictionary"
```

---

### Task 2: Fastify Error Plugin & Reply Decorator

**Files:**
- Create: `apps/api/src/plugins/error-handler.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/plugins/error-handler.test.ts`

**Interfaces:**
- Consumes: `API_ERROR_CODES`, `API_ERROR_REGISTRY`, `type ApiErrorCode`, `type ApiErrorPayload` from `@asc/types`.
- Produces: `sendApiError(reply, options)`, `reply.sendApiError(options)`, `registerErrorHandler(app)`.

- [ ] **Step 1: Write tests for `sendApiError` and `registerErrorHandler`**

Create `apps/api/src/plugins/error-handler.test.ts`:
```ts
import { API_ERROR_CODES } from "@asc/types";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { registerErrorHandler, sendApiError } from "./error-handler.js";

describe("error-handler plugin and sendApiError helper", () => {
  it("sends standard error with inferred status code and default message", async () => {
    const app = Fastify();
    await app.register(registerErrorHandler);
    app.get("/test-facility", async (_req, reply) => {
      return reply.sendApiError({ code: API_ERROR_CODES.FACILITY_REQUIRED });
    });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/test-facility" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      code: "facility_required",
      message: "Facility context is required.",
    });
    await app.close();
  });

  it("supports custom message, custom status, and structured details", async () => {
    const app = Fastify();
    await app.register(registerErrorHandler);
    app.get("/test-custom", async (_req, reply) => {
      return reply.sendApiError({
        code: API_ERROR_CODES.NOT_FOUND,
        message: "Case case_123 not found in facility fac_1",
        details: { caseId: "case_123" },
      });
    });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/test-custom" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      code: "not_found",
      message: "Case case_123 not found in facility fac_1",
      details: { caseId: "case_123" },
    });
    await app.close();
  });

  it("catches ZodError thrown in route handlers and formats with 400 invalid_payload", async () => {
    const app = Fastify();
    await app.register(registerErrorHandler);
    app.post("/test-zod", async (req) => {
      const schema = z.object({ requiredField: z.string() });
      schema.parse(req.body);
      return { ok: true };
    });
    await app.ready();

    const res = await app.inject({ method: "POST", url: "/test-zod", payload: {} });
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.code).toBe("invalid_payload");
    expect(json.message).toBe("Invalid request payload.");
    expect(json.details).toHaveProperty("requiredField");
    await app.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api test apps/api/src/plugins/error-handler.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `apps/api/src/plugins/error-handler.ts` and wire into `app.ts`**

```ts
import {
  API_ERROR_CODES,
  API_ERROR_REGISTRY,
  type ApiErrorCode,
  type ApiErrorPayload,
  type ConflictReason,
  type DuplicateMatchResult,
} from "@asc/types";
import { formatZodError, isZodError } from "@asc/validation";
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

export interface SendApiErrorOptions {
  readonly code: ApiErrorCode;
  readonly status?: number;
  readonly message?: string;
  readonly details?: Record<string, string>;
  readonly duplicateMatch?: DuplicateMatchResult;
  readonly reasons?: readonly ConflictReason[];
}

export function sendApiError(reply: FastifyReply, options: SendApiErrorOptions): FastifyReply {
  const reg = API_ERROR_REGISTRY[options.code];
  const status = options.status ?? reg.status;
  const message = options.message ?? reg.defaultMessage;

  const payload: ApiErrorPayload = {
    code: options.code,
    message,
    ...(options.details ? { details: options.details } : {}),
    ...(options.reasons ? { reasons: options.reasons } : {}),
    ...(options.duplicateMatch ? { duplicateMatch: options.duplicateMatch } : {}),
  };

  return reply.code(status).send(payload);
}

declare module "fastify" {
  interface FastifyReply {
    sendApiError(options: SendApiErrorOptions): FastifyReply;
  }
}

const errorHandlerPlugin: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  app.decorateReply("sendApiError", function (this: FastifyReply, options: SendApiErrorOptions) {
    return sendApiError(this, options);
  });

  app.setErrorHandler((error: Error, request: FastifyRequest, reply: FastifyReply) => {
    if (isZodError(error)) {
      return reply.code(400).send(formatZodError(error));
    }

    const fastifyError = error as Error & { statusCode?: number; code?: string };
    if (fastifyError.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE" || fastifyError.code === "FST_ERR_CTP_EMPTY_JSON_BODY") {
      return reply.sendApiError({
        code: API_ERROR_CODES.INVALID_PAYLOAD,
        status: 400,
        message: fastifyError.message,
      });
    }

    if (fastifyError.statusCode === 429) {
      return reply.sendApiError({
        code: API_ERROR_CODES.RATE_LIMITED,
        status: 429,
        message: fastifyError.message,
      });
    }

    request.log.error({ errorName: error.name, message: error.message }, "Unhandled error caught by central handler");
    return reply.sendApiError({
      code: API_ERROR_CODES.INTERNAL_ERROR,
      status: 500,
      message: "Internal server error.",
    });
  });
};

export const registerErrorHandler = fp(errorHandlerPlugin);
```

In `apps/api/src/app.ts`, register `registerErrorHandler(app)` before route registration.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter api test apps/api/src/plugins/error-handler.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/plugins/error-handler.ts apps/api/src/plugins/error-handler.test.ts apps/api/src/app.ts
git commit -m "feat(api): add centralized error-handler plugin and sendApiError decorator"
```

---

### Task 3: Case Context Hook & Validation Hooks

**Files:**
- Create: `apps/api/src/hooks/case-context.ts`
- Create: `apps/api/src/hooks/validation.ts`
- Test: `apps/api/src/hooks/case-context.test.ts`

**Interfaces:**
- Consumes: `API_ERROR_CODES` from `@asc/types`, `findAuthorizedEncounter` from `encounter-lookup.ts`.
- Produces: `requireCaseContext`, `requireCapabilityHook(capability)`, `getCaseContext(request)`, `validateBody(schema)`.

- [ ] **Step 1: Write tests for `requireCaseContext` and `validateBody`**

Create `apps/api/src/hooks/case-context.test.ts`:
```ts
import { API_ERROR_CODES } from "@asc/types";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { registerErrorHandler } from "../plugins/error-handler.js";
import { getCaseContext, requireCaseContext } from "./case-context.js";
import { validateBody } from "./validation.js";

describe("case-context and validation hooks", () => {
  it("rejects with 400 facility_required when x-facility-id is missing", async () => {
    const app = Fastify();
    await app.register(registerErrorHandler);
    app.post("/cases/:caseId/test", { preHandler: [requireCaseContext] }, async () => ({ ok: true }));
    await app.ready();

    const res = await app.inject({ method: "POST", url: "/cases/enc-123/test" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: API_ERROR_CODES.FACILITY_REQUIRED });
    await app.close();
  });

  it("rejects with 400 invalid_case_id when caseId is not valid FHIR ID", async () => {
    const app = Fastify();
    await app.register(registerErrorHandler);
    app.post("/cases/:caseId/test", { preHandler: [requireCaseContext] }, async () => ({ ok: true }));
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/cases/bad$$case/test",
      headers: { "x-facility-id": "fac-1" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: API_ERROR_CODES.INVALID_CASE_ID });
    await app.close();
  });

  it("validateBody parses valid JSON and replaces request.body", async () => {
    const app = Fastify();
    await app.register(registerErrorHandler);
    const schema = z.object({ count: z.number() });
    app.post("/test-body", { preHandler: [validateBody(schema)] }, async (req) => {
      const body = req.body as { count: number };
      return { doubled: body.count * 2 };
    });
    await app.ready();

    const res = await app.inject({ method: "POST", url: "/test-body", payload: { count: 21 } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ doubled: 42 });
    await app.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api test apps/api/src/hooks/case-context.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `apps/api/src/hooks/case-context.ts` and `apps/api/src/hooks/validation.ts`**

`apps/api/src/hooks/case-context.ts`:
```ts
import { API_ERROR_CODES, type Capability } from "@asc/types";
import type { Encounter } from "@medplum/fhirtypes";
import type { FastifyReply, FastifyRequest } from "fastify";
import { FHIR_ID, resolveFacilityId } from "../routes/route-helpers.js";
import { findAuthorizedEncounter } from "../services/encounter-lookup.js";

declare module "fastify" {
  interface FastifyRequest {
    caseContext?: {
      readonly caseId: string;
      readonly facilityId: string;
      readonly encounter: Encounter;
    };
  }
}

interface CaseParams {
  readonly caseId?: string;
}

export function getCaseContext(request: FastifyRequest): {
  readonly caseId: string;
  readonly facilityId: string;
  readonly encounter: Encounter;
} {
  if (!request.caseContext) {
    throw new Error("caseContext is missing. Ensure requireCaseContext preHandler is attached.");
  }
  return request.caseContext;
}

export function requireCapabilityHook(capability: Capability) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const facilityId = request.caseContext?.facilityId ?? resolveFacilityId(request);
    if (!facilityId) {
      reply.sendApiError({ code: API_ERROR_CODES.FACILITY_REQUIRED });
      return;
    }
    const hasCap = await request.server.guards.requireCapabilityAt(request, reply, capability, facilityId);
    if (!hasCap) return;
  };
}

export async function requireCaseContext(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const facilityId = request.caseContext?.facilityId ?? resolveFacilityId(request);
  if (!facilityId) {
    reply.sendApiError({ code: API_ERROR_CODES.FACILITY_REQUIRED });
    return;
  }
  const { caseId } = (request.params as CaseParams) ?? {};
  if (!caseId || !FHIR_ID.test(caseId)) {
    reply.sendApiError({ code: API_ERROR_CODES.INVALID_CASE_ID });
    return;
  }
  const encounter = await findAuthorizedEncounter(request.medplum, facilityId, caseId);
  if (!encounter) {
    reply.sendApiError({
      code: API_ERROR_CODES.NOT_FOUND,
      message: `Case ${caseId} not found or does not belong to facility ${facilityId}`,
    });
    return;
  }
  request.caseContext = { caseId, facilityId, encounter };
}
```

`apps/api/src/hooks/validation.ts`:
```ts
import { formatZodError } from "@asc/validation";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ZodType } from "zod";

export function validateBody<TOutput, TInput>(schema: ZodType<TOutput, unknown, TInput>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send(formatZodError(parsed.error));
      return;
    }
    request.body = parsed.data;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter api test apps/api/src/hooks/case-context.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/hooks/case-context.ts apps/api/src/hooks/validation.ts apps/api/src/hooks/case-context.test.ts
git commit -m "feat(api): add requireCaseContext and validateBody preHandler hooks"
```

---

### Task 4: Extract Controllers in `apps/api/src/controllers/`

**Files:**
- Create: `apps/api/src/controllers/financial.controller.ts`
- Create: `apps/api/src/controllers/consent.controller.ts`
- Create: `apps/api/src/controllers/hp.controller.ts`
- Create: `apps/api/src/controllers/preop.controller.ts`
- Create: `apps/api/src/controllers/cases.controller.ts`

**Interfaces:**
- Consumes: Services (`financialClearanceService`, `consentService`, `hpService`, `preopService`, `caseReadService`, `caseBookingService`), `getCaseContext(request)`.
- Produces: Controller handler functions mapping HTTP requests to domain services with `sendApiError`.

- [ ] **Step 1: Implement `apps/api/src/controllers/financial.controller.ts`**

Implement `checkEligibility`, `getFinancialSummary`, `recordCopay`, and `revalidatePriorAuth` using `getCaseContext(request)`:
```ts
import { API_ERROR_CODES } from "@asc/types";
import type { CopayCollection, EligibilityCheckRequest, PriorAuthCheck } from "@asc/validation/financial";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getCaseContext } from "../hooks/case-context.js";
import { financialClearanceService } from "../services/financial-clearance-service.js";

export const financialController = {
  async checkEligibility(request: FastifyRequest<{ Body: EligibilityCheckRequest }>, reply: FastifyReply) {
    const { caseId, facilityId } = getCaseContext(request);
    const result = await financialClearanceService.checkEligibility({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: request.body,
      logger: request.log,
    });
    if (result.status === 404) {
      return reply.sendApiError({ code: API_ERROR_CODES.NOT_FOUND, message: result.message });
    }
    return reply.code(200).send(result.data);
  },

  async getFinancialSummary(request: FastifyRequest, reply: FastifyReply) {
    const { caseId, facilityId } = getCaseContext(request);
    const result = await financialClearanceService.getFinancialSummary({
      medplum: request.medplum,
      facilityId,
      caseId,
      logger: request.log,
    });
    if (result.status === 404) {
      return reply.sendApiError({ code: API_ERROR_CODES.NOT_FOUND, message: result.message });
    }
    return reply.code(200).send(result.data);
  },

  async recordCopay(request: FastifyRequest<{ Body: CopayCollection }>, reply: FastifyReply) {
    const { caseId, facilityId } = getCaseContext(request);
    const result = await financialClearanceService.recordCopayCollection({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: request.body,
      logger: request.log,
    });
    if (result.status === 404) {
      return reply.sendApiError({ code: API_ERROR_CODES.NOT_FOUND, message: result.message });
    }
    return reply.code(200).send(result.data);
  },

  async revalidatePriorAuth(request: FastifyRequest<{ Body: PriorAuthCheck }>, reply: FastifyReply) {
    const { caseId, facilityId } = getCaseContext(request);
    const result = await financialClearanceService.revalidatePriorAuth({
      medplum: request.medplum,
      facilityId,
      caseId,
      input: request.body,
      logger: request.log,
    });
    if (result.status === 404) {
      return reply.sendApiError({ code: API_ERROR_CODES.NOT_FOUND, message: result.message });
    }
    return reply.code(200).send(result.data);
  },
};
```

- [ ] **Step 2: Implement remaining controllers (`consent`, `hp`, `preop`, `cases`)**

Extract respective handlers into `consent.controller.ts`, `hp.controller.ts`, `preop.controller.ts`, and `cases.controller.ts` following the exact same pattern:
- Use `getCaseContext(request)` to obtain validated `caseId` and `facilityId`.
- Replace manual error responses with `reply.sendApiError(...)`.

- [ ] **Step 3: Run type check on API package**

Run: `pnpm --filter api check-types`
Expected: PASS (zero type errors).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/controllers/
git commit -m "feat(api): extract domain controllers with type-safe error replies"
```

---

### Task 5: Declarative Routes Migration & Boilerplate Removal

**Files:**
- Modify: `apps/api/src/routes/financial.ts`
- Modify: `apps/api/src/routes/consent.ts`
- Modify: `apps/api/src/routes/hp.ts`
- Modify: `apps/api/src/routes/preop.ts`
- Modify: `apps/api/src/routes/cases.ts`

**Interfaces:**
- Consumes: `API_ROUTE_PATTERNS`, `requireCaseContext`, `requireCapabilityHook`, `validateBody`, controllers.
- Produces: Clean, readable Fastify route plugins without inline boilerplate.

- [ ] **Step 1: Refactor `apps/api/src/routes/financial.ts`**

Update `financial.ts` to be a declarative route registration plugin:
```ts
import { API_ROUTE_PATTERNS } from "@asc/config";
import { copayCollectionSchema, eligibilityCheckRequestSchema, priorAuthCheckSchema } from "@asc/validation";
import type { FastifyInstance } from "fastify";
import { capabilityAtResource } from "../auth/route-auth.js";
import { financialController } from "../controllers/financial.controller.js";
import { requireCapabilityHook, requireCaseContext } from "../hooks/case-context.js";
import { validateBody } from "../hooks/validation.js";

export function financialRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    API_ROUTE_PATTERNS.caseEligibilityCheck,
    {
      config: capabilityAtResource("patient.eligibility.check"),
      preHandler: [
        requireCaseContext,
        requireCapabilityHook("patient.eligibility.check"),
        validateBody(eligibilityCheckRequestSchema),
      ],
    },
    financialController.checkEligibility
  );

  app.get(
    API_ROUTE_PATTERNS.caseFinancialSummary,
    {
      config: capabilityAtResource("case.read"),
      preHandler: [requireCaseContext, requireCapabilityHook("case.read")],
    },
    financialController.getFinancialSummary
  );

  app.post(
    API_ROUTE_PATTERNS.caseCopayCollected,
    {
      config: capabilityAtResource("patient.billing.collect"),
      preHandler: [
        requireCaseContext,
        requireCapabilityHook("patient.billing.collect"),
        validateBody(copayCollectionSchema),
      ],
    },
    financialController.recordCopay
  );

  app.post(
    API_ROUTE_PATTERNS.casePriorAuth,
    {
      config: capabilityAtResource("patient.priorauth.manage"),
      preHandler: [
        requireCaseContext,
        requireCapabilityHook("patient.priorauth.manage"),
        validateBody(priorAuthCheckSchema),
      ],
    },
    financialController.revalidatePriorAuth
  );

  return Promise.resolve();
}
```

- [ ] **Step 2: Refactor remaining route files (`consent.ts`, `hp.ts`, `preop.ts`, `cases.ts`)**

Update each file to bind `API_ROUTE_PATTERNS` to its controller using `requireCaseContext`, `requireCapabilityHook`, and `validateBody`.

- [ ] **Step 3: Run full API test suite**

Run: `pnpm --filter api test`
Expected: All 27 test files pass (278 tests green), zero failures.
Run: `pnpm --filter api test src/auth/route-inventory.test.ts`
Expected: PASS (zero route capability or auth mode drift).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/
git commit -m "refactor(api): migrate routes to declarative preHandler hooks and controllers"
```

---

### Task 6: Mock Server Error Parity Alignment

**Files:**
- Modify: `apps/web/src/mocks/handlers/clinical/respond.ts`
- Modify: `apps/web/src/mocks/handlers/clinical/cases.ts`
- Test: `apps/web/src/mocks/handlers/cases.test.ts`

**Interfaces:**
- Consumes: `API_ERROR_CODES` from `@asc/types`.
- Produces: Byte-for-byte error code parity between MSW mocks and Fastify backend.

- [ ] **Step 1: Update `apps/web/src/mocks/handlers/clinical/respond.ts` to use `API_ERROR_CODES`**

```ts
import { API_ERROR_CODES, type ApiErrorCode, type ApiErrorPayload, type CaseDetail, type RuleResult } from "@asc/types";
import { delay, HttpResponse } from "msw";
import { caseDetail } from "../../db/store";
import { latencyMs } from "../../db/util";

export function apiError(
  status: number,
  code: ApiErrorCode | string,
  message: string,
  details?: Record<string, string>,
  reasons?: readonly { readonly code: string; readonly message: string }[]
) {
  const body: ApiErrorPayload = {
    message,
    code,
    ...(details ? { details } : {}),
    ...(reasons ? { reasons } : {}),
  };
  return HttpResponse.json(body, { status });
}

export const notFound = (what: string) =>
  apiError(404, what === "Case" ? API_ERROR_CODES.NOT_FOUND : `${what.toLowerCase()}_not_found`, `${what} not found`);

export const caseNotFound = (caseId: string) =>
  apiError(404, API_ERROR_CODES.NOT_FOUND, `Case ${caseId} not found`);

export function gateFailed(result: RuleResult, status = 409) {
  return apiError(
    status,
    API_ERROR_CODES.GATE_FAILED,
    result.reasons[0]?.message ?? "Clinical gate rejected transition",
    undefined,
    result.reasons
  );
}
```

- [ ] **Step 2: Update mock `cases.ts` to replace hardcoded strings and status codes**

- Replace `"invalid_payload"` with `API_ERROR_CODES.INVALID_PAYLOAD`.
- Replace 422 `GATE_FAILED` with 409 `API_ERROR_CODES.GATE_FAILED` for consistency with Fastify.

- [ ] **Step 3: Run web tests to verify mock parity**

Run: `pnpm --filter web test src/mocks/handlers/cases.test.ts`
Expected: 27/27 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/mocks/
git commit -m "refactor(mocks): align MSW error codes and status codes with API_ERROR_CODES"
```

---

### Task 7: Full Monorepo Quality Gates & Verification

- [ ] **Step 1: Run complete type check across all workspaces**

Run: `pnpm turbo run check-types`
Expected: 0 errors across all packages.

- [ ] **Step 2: Run linter across all workspaces**

Run: `pnpm turbo run lint`
Expected: 0 warnings, 0 errors.

- [ ] **Step 3: Run all test suites across the monorepo**

Run: `pnpm turbo run test`
Expected: 100% tests passing (51/51 tasks green in Turborepo).

- [ ] **Step 4: Update Documentation**

Update `LEARNING_MISTAKES.md` with:
- `LM-035 — Centralize API error codes in @asc/types; use preHandler hooks and controllers to eliminate repetitive route boilerplate; never double-nest details in ApiErrorPayload`.
Update `PROGRESS.md` noting the API architecture hardening.

- [ ] **Step 5: Final Commit**

```bash
git add LEARNING_MISTAKES.md PROGRESS.md
git commit -m "docs: record LM-035 on centralized API errors and clean Fastify layering"
```
