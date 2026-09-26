/**
 * Runs an agent definition: validate input → (claim the run record) → check
 * context → build messages → gateway (structured output, validated against
 * the output schema) → (persist output) → audit.
 *
 * Every call writes exactly one audit event, on success AND failure. Audit
 * details carry routing metadata, token counts, a failure kind and the context
 * manifest's size + hash only — never input values, context values, prompts,
 * output or error messages.
 *
 * Execution state (optional `runStore`): with a stable `executionId` a retry
 * is idempotent — a succeeded run is replayed from the store without calling
 * a model (audited as `agent.run.replay`, so `agent.run` SUCCESS stays one per
 * generated output); a run in progress elsewhere throws AgentRunInProgressError
 * (unless stale); a failed run is re-run under the same id.
 */

import { getAuditClient, type AuditClient, type AuditDetails } from '@asc/audit';
import type { z } from 'zod';

import { ContextScopeError, StaleContextError, assertContextFresh, assertContextScope } from '../context/assert.js';
import { buildContextManifest, computeContentHash, containsPhiFromContext } from '../context/manifest.js';
import type { RunContext } from '../context/types.js';
import {
  AgentExecutionError,
  NoAvailableModelError,
  NoCapableModelError,
  NoCompliantModelError,
  type AgentFailureKind,
} from '../runtime/errors.js';
import {
  defaultGateway,
  type AgentExecutionMeta,
  type AgentObjectResult,
  type AgentTokenUsage,
  type Gateway,
} from '../runtime/gateway.js';
import {
  AgentRunConflictError,
  AgentRunInProgressError,
  DEFAULT_STALE_RUN_AFTER_MS,
  isSameRunOwner,
  type AgentRunRecord,
  type AgentRunStart,
  type AgentRunStore,
} from '../state/run-store.js';
import { requiredCapabilities, type AgentDefinition } from './define.js';

/** Who triggered the run. The agent itself is recorded as the audit actor. */
export interface AgentActor {
  type: 'user' | 'system';
  id: string;
}

/** Where audit events go. `@asc/audit`'s client satisfies this. */
export type AgentAuditSink = Pick<AuditClient, 'logEvent'>;

export interface RunAgentOptions {
  actor: AgentActor;
  /**
   * REQUIRED, as for the gateway: does the input contain PHI? Agents whose
   * task handles PHI, and runs whose context has a `phi` item, are always
   * routed as PHI regardless (escalation only — never lowered).
   */
  containsPhi: boolean;
  /** Internal ids for the audit trail (never names or MRNs). */
  patientId?: string;
  surgicalCaseId?: string;
  /** The app's configured gateway (hosting target, routing profile). Defaults to `defaultGateway`. */
  gateway?: Gateway;
  /** Defaults to `getAuditClient()` — which fails closed in production without a durable store. */
  audit?: AgentAuditSink;
  abortSignal?: AbortSignal;
  /**
   * Stable id for this run, used as its `agentExecutionId` — e.g. derived from
   * the BullMQ job id so a retried job keeps its id. No PHI. Without it the
   * gateway generates one per call.
   */
  executionId?: string;
  /**
   * Execution-state store (a PHI store: it keeps the output for replay). With
   * it the run is claimed before any model call, its output persisted before
   * `runAgent` returns, and retries under the same `executionId` are
   * idempotent. Without `executionId`, a fresh id is recorded (no idempotency).
   */
  runStore?: AgentRunStore;
  /** When a `running` record may be taken over as crashed. Default `DEFAULT_STALE_RUN_AFTER_MS` (10 min). */
  staleRunAfterMs?: number;
  /**
   * Context assembled by the app's ContextProviders. Checked before any model
   * call (every item in `scope`, none stale), passed to `buildMessages`, and
   * recorded as a manifest (metadata only) on the run record.
   */
  context?: RunContext;
}

export interface AgentRunMeta extends AgentExecutionMeta {
  agent: string;
  promptVersion: string;
  /** True when the output was replayed from the run store; no model was called. */
  replayed?: boolean;
}

export interface AgentRunResult<Output> {
  output: Output;
  meta: AgentRunMeta;
}

/** Input failed the agent's schema. Lists field paths only — never the offending values. */
export class AgentInputError extends Error {
  override readonly name = 'AgentInputError';
  readonly agent: string;
  readonly fields: readonly string[];

  constructor(agent: string, fields: readonly string[]) {
    super(`Invalid input for agent "${agent}": ${fields.join(', ')}.`);
    this.agent = agent;
    this.fields = fields;
  }
}

export const AGENT_RUN_ACTION = 'agent.run';
/** Audit action of a replayed run: a stored output (PHI) was returned again; no model was called. */
export const AGENT_RUN_REPLAY_ACTION = 'agent.run.replay';

export async function runAgent<Name extends string, Input extends z.ZodTypeAny, Output extends z.ZodTypeAny>(
  definition: AgentDefinition<Name, Input, Output>,
  input: z.input<Input>,
  options: RunAgentOptions,
): Promise<AgentRunResult<z.output<Output>>> {
  // Resolved first so a missing audit store fails before any model is called.
  const audit = options.audit ?? getAuditClient();
  const gateway = options.gateway ?? defaultGateway;
  const { context, runStore } = options;
  // A run record needs its id before the model call; otherwise the gateway generates one.
  const executionId = options.executionId ?? (runStore ? crypto.randomUUID() : undefined);
  // Context can only escalate to PHI, never lower the caller's flag.
  const containsPhi = options.containsPhi || (context !== undefined && containsPhiFromContext(context.items));
  const record = (
    action: string,
    outcome: 'SUCCESS' | 'FAILURE',
    agentExecutionId: string | undefined,
    details: AuditDetails,
  ) =>
    audit.logEvent({
      action,
      actorType: 'agent',
      actorId: definition.name,
      agentExecutionId,
      patientId: options.patientId,
      surgicalCaseId: options.surgicalCaseId,
      outcome,
      details: {
        agent: definition.name,
        promptVersion: definition.promptVersion,
        triggeredByType: options.actor.type,
        triggeredById: options.actor.id,
        ...details,
      },
    });

  /** Returns a succeeded run's stored output, re-validated so a drifted or corrupt record is never replayed. */
  async function replay(stored: AgentRunRecord): Promise<AgentRunResult<z.output<Output>>> {
    const parsed = definition.output.safeParse(stored.output);
    if (!parsed.success || !stored.meta) throw new AgentRunConflictError(stored.executionId, 'output-invalid');
    const meta: AgentRunMeta = {
      ...stored.meta,
      agent: stored.agent,
      promptVersion: stored.promptVersion,
      replayed: true,
    };
    await record(AGENT_RUN_REPLAY_ACTION, 'SUCCESS', meta.agentExecutionId, {
      promptVersion: stored.promptVersion,
      replayed: true,
      task: meta.task,
      tier: meta.tier,
      containsPhi: meta.containsPhi,
      hostingTarget: meta.hostingTarget,
      endpoint: meta.endpoint,
      modelName: meta.modelName,
      modelId: meta.modelId,
      attempts: 0, // models called by THIS call; the original run's event has the real count
    });
    // zod 3 types safeParse on a generic schema as `any`; the data was parsed by `Output`.
    return { output: parsed.data as z.output<Output>, meta };
  }

  let contextDetails: AuditDetails = {};
  let claim: number | undefined;
  let result: AgentObjectResult<z.output<Output>>;
  try {
    const manifest = context && buildContextManifest(context.items);
    if (manifest) {
      contextDetails = { contextItems: manifest.length, contextManifestHash: await computeContentHash(manifest) };
    }

    const parsed = definition.input.safeParse(input);
    if (!parsed.success) throw new AgentInputError(definition.name, fieldPaths(parsed.error));
    // zod 3 types safeParse on a generic schema as `any`; the data was parsed by `Input`.
    const validInput = parsed.data as z.output<Input>;

    if (runStore && executionId) {
      const start: AgentRunStart = {
        executionId,
        agent: definition.name,
        promptVersion: definition.promptVersion,
        containsPhi,
        orgId: context?.scope.orgId,
        patientId: options.patientId,
        surgicalCaseId: options.surgicalCaseId,
        contextManifest: manifest,
      };
      const begun = await runStore.begin(start, {
        staleAfterMs: options.staleRunAfterMs ?? DEFAULT_STALE_RUN_AFTER_MS,
      });
      if (begun.record.agent !== definition.name) throw new AgentRunConflictError(executionId, 'agent-mismatch');
      if (!isSameRunOwner(begun.record, start)) throw new AgentRunConflictError(executionId, 'scope-mismatch');
      if (!begun.claimed) {
        // Replay skips the context checks below: the context was checked when the output was generated.
        if (begun.record.status === 'succeeded') return await replay(begun.record);
        throw new AgentRunInProgressError(executionId);
      }
      claim = begun.record.claim;
    }

    if (context) {
      assertRunScope(context, options);
      assertContextScope(context.items, context.scope);
      assertContextFresh(context.items, new Date());
    }

    result = await gateway.executeAgentObject<z.output<Output>>({
      task: definition.task,
      reasoning: definition.reasoning,
      models: definition.models,
      requires: requiredCapabilities(definition),
      containsPhi,
      instructions: definition.instructions,
      messages: definition.buildMessages(validInput, context),
      schema: definition.output,
      tools: definition.tools,
      maxSteps: definition.maxSteps,
      abortSignal: options.abortSignal,
      executionId,
    });

    // Persisted before returning, i.e. before the caller's side effects (drafts): a retry replays it.
    if (runStore && executionId && claim !== undefined) {
      const { output, ...meta } = result;
      const saved = await runStore.succeed(executionId, { claim, output, meta });
      if (!saved) throw new AgentRunConflictError(executionId, 'claim-lost');
    }
  } catch (error) {
    const details = failureDetails(error);
    try {
      // Only the claim owner marks the run failed; an in-progress or conflicting record is left alone.
      if (runStore && executionId && claim !== undefined) {
        await runStore.fail(executionId, { claim, failureKind: details.failureKind, errorName: details.errorName });
      }
    } finally {
      // Written even if the store write failed. If the audit write itself fails, that error
      // propagates instead: audit loss must be loud.
      await record(AGENT_RUN_ACTION, 'FAILURE', executionIdOf(error) ?? executionId, {
        ...contextDetails,
        ...details,
      });
    }
    throw error;
  }

  const { output, ...execution } = result;
  await record(AGENT_RUN_ACTION, 'SUCCESS', execution.agentExecutionId, {
    task: execution.task,
    tier: execution.tier,
    containsPhi: execution.containsPhi,
    hostingTarget: execution.hostingTarget,
    endpoint: execution.endpoint,
    modelName: execution.modelName,
    modelId: execution.modelId,
    attempts: execution.attempts,
    ...usageDetails(execution.usage),
    ...contextDetails,
    ...(claim !== undefined && { runClaim: claim }),
  });
  return { output, meta: { ...execution, agent: definition.name, promptVersion: definition.promptVersion } };
}

/** The context's scope must agree with the ids the run is audited under. */
function assertRunScope(context: RunContext, options: RunAgentOptions): void {
  const mismatches: ContextScopeError['mismatches'][number][] = [];
  if (options.patientId !== undefined && context.scope.patientId !== options.patientId) {
    mismatches.push({ key: '(run)', field: 'patientId' });
  }
  if (options.surgicalCaseId !== undefined && context.scope.caseId !== options.surgicalCaseId) {
    mismatches.push({ key: '(run)', field: 'caseId' });
  }
  if (mismatches.length > 0) throw new ContextScopeError(mismatches);
}

function fieldPaths(error: z.ZodError): string[] {
  const paths = error.issues.flatMap((issue) =>
    issue.code === 'unrecognized_keys'
      ? issue.keys.map((key) => [...issue.path, key].join('.'))
      : [issue.path.join('.') || '(root)'],
  );
  return [...new Set(paths)];
}

function executionIdOf(error: unknown): string | undefined {
  return error instanceof AgentExecutionError ? error.agentExecutionId : undefined;
}

/** Token counts only (numbers); providers that report nothing add nothing. */
function usageDetails(usage: AgentTokenUsage | undefined): AuditDetails {
  const details: AuditDetails = {};
  if (!usage) return details;
  for (const key of ['inputTokens', 'outputTokens', 'cachedInputTokens', 'totalTokens'] as const) {
    const value = usage[key];
    if (value !== undefined) details[key] = value;
  }
  return details;
}

type FailureDetails = AuditDetails & { errorName: string; failureKind: AgentFailureKind };

/**
 * PHI-free failure metadata: error name, failure kind (from error types only,
 * never messages) plus whatever routing facts the error carries.
 */
function failureDetails(error: unknown): FailureDetails {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  if (error instanceof AgentExecutionError) {
    return {
      errorName,
      failureKind: error.failureKind,
      tier: error.tier,
      hostingTarget: error.hostingTarget,
      endpoint: error.lastEndpoint,
      modelId: error.lastModelId,
      attempts: error.attempts,
      retryable: error.retryable,
      deadlineExceeded: error.deadlineExceeded,
    };
  }
  if (
    error instanceof NoCompliantModelError ||
    error instanceof NoCapableModelError ||
    error instanceof NoAvailableModelError
  ) {
    return {
      errorName,
      failureKind: 'no-model',
      tier: error.tier,
      hostingTarget: error.hostingTarget,
      attempts: 0,
    };
  }
  return { errorName, failureKind: simpleFailureKind(error), attempts: 0 };
}

/** Failures raised before (or instead of) a model call. */
function simpleFailureKind(error: unknown): AgentFailureKind {
  if (error instanceof AgentInputError) return 'input';
  if (error instanceof ContextScopeError || error instanceof StaleContextError) return 'context';
  if (error instanceof AgentRunInProgressError || error instanceof AgentRunConflictError) return 'run-state';
  return 'unknown';
}
