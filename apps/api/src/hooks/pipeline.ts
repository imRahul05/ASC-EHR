import { API_ERROR_CODES, type Capability } from "@asc/types";
import type { ZodType, ZodTypeDef } from "@asc/validation";
import type { FastifyReply, FastifyRequest } from "fastify";
import "../auth/augment.js";
import "../plugins/error-handler.js";
import { requireCapabilityHook, requireCaseContext } from "./case-context.js";
import { requireIdempotency } from "./idempotency.js";
import { validateBody, validateQuery } from "./validation.js";

type PipelineHook = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

interface ClinicalMutationPipelineOptions<
  TOutput = never,
  TDef extends ZodTypeDef = ZodTypeDef,
  TInput = TOutput,
> {
  /**
   * The minimum capability required to perform this clinical mutation at the target facility.
   * Gates 3 & 4 capability verification strictly executes first to prevent unauthorized
   * resource enumeration under the HIPAA Security Rule (45 CFR § 164.312(a)(1)).
   */
  readonly capability: Capability;

  /**
   * Optional Zod schema to validate request body payload against.
   */
  readonly schema?: ZodType<TOutput, TDef, TInput>;

  /**
   * Optional custom error message for body validation failures.
   */
  readonly errorMessage?: string;

  /**
   * Whether to enable idempotency caching via Idempotency-Key header.
   * Defaults to true.
   */
  readonly enableIdempotency?: boolean;

  /**
   * Whether to require an If-Match header for optimistic concurrency control.
   * When true, requests missing the If-Match header are rejected with 400 Bad Request.
   * Defaults to false.
   */
  readonly enforceIfMatch?: boolean;
}

interface ClinicalQueryPipelineOptions<
  TOutput = never,
  TDef extends ZodTypeDef = ZodTypeDef,
  TInput = TOutput,
> {
  /**
   * The minimum capability required to read this clinical resource at the target facility.
   */
  readonly capability: Capability;

  /**
   * Optional Zod schema to validate URL query parameters against.
   */
  readonly querySchema?: ZodType<TOutput, TDef, TInput>;

  /**
   * Optional custom error message for query validation failures.
   */
  readonly errorMessage?: string;
}

/**
 * Pre-handler hook verifying that an If-Match header is present when optimistic
 * concurrency enforcement is enabled.
 */
function requireIfMatchHeader(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const ifMatchHeader = request.headers["if-match"];
  if (typeof ifMatchHeader !== "string" || ifMatchHeader.trim() === "") {
    reply.sendApiError({
      code: API_ERROR_CODES.BAD_REQUEST,
      status: 400,
      message: "If-Match header is required for this operation.",
    });
    return Promise.resolve();
  }
  return Promise.resolve();
}

/**
 * Creates a canonical, tamper-proof preHandler hook pipeline for clinical mutations.
 *
 * Enforces the strict sequence:
 * 1. Gate 3 & 4 capability verification (fail-closed, prevents resource enumeration)
 * 2. Idempotency cache lookup/replay (short-circuits cached mutations with 200)
 * 3. Optimistic locking header check (If-Match presence if enforceIfMatch: true)
 * 4. Case hydration & facility ownership verification (Medplum Encounter lookup)
 * 5. Zod schema validation (parses and replaces request.body)
 *
 * @see 45 CFR § 164.312(a)(1) - Access Control & Minimum Necessary
 */
export function createClinicalMutationPipeline<
  TOutput = never,
  TDef extends ZodTypeDef = ZodTypeDef,
  TInput = TOutput,
>(
  options: ClinicalMutationPipelineOptions<TOutput, TDef, TInput>,
): readonly PipelineHook[] {
  const hooks: PipelineHook[] = [];

  // Step 1: Verify capability before touching database or cache (LM-034, LM-035)
  hooks.push(requireCapabilityHook(options.capability));

  // Step 2: Idempotency replay (if enabled)
  if (options.enableIdempotency !== false) {
    hooks.push(requireIdempotency);
  }

  // Step 3: Optimistic concurrency header check (if required)
  if (options.enforceIfMatch === true) {
    hooks.push(requireIfMatchHeader);
  }

  // Step 4: Hydrate case context and verify facility ownership
  hooks.push(requireCaseContext);

  // Step 5: Validate request payload against domain schema
  if (options.schema !== undefined) {
    hooks.push(validateBody(options.schema, options.errorMessage));
  }

  return hooks;
}

/**
 * Creates a canonical preHandler hook pipeline for clinical queries.
 *
 * Enforces the strict sequence:
 * 1. Gate 3 & 4 capability verification
 * 2. Case hydration & facility ownership verification
 * 3. Query parameter validation
 */
export function createClinicalQueryPipeline<
  TOutput = never,
  TDef extends ZodTypeDef = ZodTypeDef,
  TInput = TOutput,
>(
  options: ClinicalQueryPipelineOptions<TOutput, TDef, TInput>,
): readonly PipelineHook[] {
  const hooks: PipelineHook[] = [];

  // Step 1: Verify capability before accessing case data
  hooks.push(requireCapabilityHook(options.capability));

  // Step 2: Hydrate case context and verify facility ownership
  hooks.push(requireCaseContext);

  // Step 3: Validate query parameters if schema provided
  if (options.querySchema !== undefined) {
    hooks.push(validateQuery(options.querySchema, options.errorMessage));
  }

  return hooks;
}
