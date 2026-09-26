/**
 * Execution state: one record per agent run (`agent_run`), created before the
 * model is called and keyed by a stable `executionId` (e.g. derived from the
 * BullMQ job id), so a retried job neither calls a model twice nor produces a
 * second draft.
 *
 * !! THIS IS A PHI STORE. A succeeded record holds the validated model output
 * (needed to replay it on retry), and outputs contain PHI. Implementations
 * belong in the apps, on encrypted, BAA-covered Postgres in the org
 * compartment, with a retention policy. Never put records — or their output —
 * in Redis, job payloads / return values, logs, telemetry or audit details.
 *
 * Interface only, like the audit store; the in-memory reference implementation
 * (`src/testing/run-store.ts`) is for tests.
 *
 * Review: docs/agent/memory-skills-proposal-review.md §3 (execution state).
 */

import type { ContextManifestEntry } from '../context/types.js';
import type { AgentFailureKind } from '../runtime/errors.js';
import type { AgentExecutionMeta } from '../runtime/gateway.js';

export type AgentRunStatus = 'running' | 'succeeded' | 'failed';

/**
 * A `running` record older than this may be taken over by another caller
 * (the previous one is presumed crashed). Must exceed the gateway's total
 * deadline, or a slow-but-alive run could be executed twice.
 */
export const DEFAULT_STALE_RUN_AFTER_MS = 10 * 60_000;

/** What `runAgent` knows before the model call. */
export interface AgentRunStart {
  executionId: string;
  agent: string;
  promptVersion: string;
  /** Effective PHI flag (caller flag OR PHI context). */
  containsPhi: boolean;
  /** Internal ids only. */
  orgId?: string;
  patientId?: string;
  surgicalCaseId?: string;
  /** Context metadata (no values). */
  contextManifest?: readonly ContextManifestEntry[];
}

export interface AgentRunRecord extends AgentRunStart {
  status: AgentRunStatus;
  /**
   * Incremented each time a caller claims the run (1 = first try, 2 = first
   * retry, …). A fencing token: `succeed` / `fail` apply only with the current claim.
   */
  claim: number;
  /** ISO 8601. `startedAt` is the latest claim. */
  createdAt: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  /** Succeeded runs: the schema-validated output. PHI. Re-validated before it is replayed. */
  output?: unknown;
  /** Succeeded runs: served model, attempts, token usage — as returned by the gateway. */
  meta?: AgentExecutionMeta;
  /** Failed runs: PHI-free failure category and error class name (never messages). */
  failureKind?: AgentFailureKind;
  errorName?: string;
}

/**
 * True when `record` was started by the same agent for the same org / patient /
 * case as `start`. A record owned by anyone else is never claimed nor replayed:
 * a reused execution id must not hand one patient's output (PHI) to another
 * patient's run, nor let a takeover rewrite the record's scope.
 */
export function isSameRunOwner(record: AgentRunStart, start: AgentRunStart): boolean {
  return (
    record.agent === start.agent &&
    record.orgId === start.orgId &&
    record.patientId === start.patientId &&
    record.surgicalCaseId === start.surgicalCaseId
  );
}

/**
 * `claimed: true` — the caller now owns the run and must execute it.
 * `claimed: false` — the record is `succeeded` (replay it), `running` and not
 * stale (another caller owns it), or has another owner (`isSameRunOwner`).
 */
export interface AgentRunBeginResult {
  claimed: boolean;
  record: AgentRunRecord;
}

export interface AgentRunStore {
  /**
   * Atomically claims the run: creates a `running` record (claim 1) if none
   * exists; re-claims a `failed` record, or a `running` one whose `startedAt`
   * is older than `staleAfterMs` (claim + 1, status `running`, start fields
   * refreshed); otherwise returns the existing record unclaimed. Never claims
   * a record with another owner (agent, org, patient or case — `isSameRunOwner`). In Postgres: one `INSERT … ON CONFLICT DO
   * UPDATE … WHERE … RETURNING`.
   */
  begin(start: AgentRunStart, options: { staleAfterMs: number }): Promise<AgentRunBeginResult>;
  /** Marks the run `succeeded` with its output. Returns false (no change) unless it is `running` with this claim. */
  succeed(
    executionId: string,
    result: { claim: number; output: unknown; meta: AgentExecutionMeta },
  ): Promise<boolean>;
  /** Marks the run `failed`. Returns false (no change) unless it is `running` with this claim. */
  fail(
    executionId: string,
    failure: { claim: number; failureKind: AgentFailureKind; errorName: string },
  ): Promise<boolean>;
  get(executionId: string): Promise<AgentRunRecord | undefined>;
}

/**
 * Another caller is executing this run (a duplicate or overlapping retry).
 * No model was called; retry later — once the record is stale it can be taken over.
 */
export class AgentRunInProgressError extends Error {
  override readonly name = 'AgentRunInProgressError';
  readonly executionId: string;

  constructor(executionId: string) {
    super(`Agent run ${executionId} is already in progress.`);
    this.executionId = executionId;
  }
}

/**
 * The run record cannot be used by this call:
 * - `agent-mismatch`  the execution id belongs to another agent's run
 * - `scope-mismatch`  the execution id belongs to a run for another org / patient / case (never replayed)
 * - `output-invalid`  a stored output no longer matches the agent's output schema (not replayed)
 * - `claim-lost`      the run was taken over (stale) while this call executed; its output was discarded
 */
export class AgentRunConflictError extends Error {
  override readonly name = 'AgentRunConflictError';
  readonly executionId: string;
  readonly reason: 'agent-mismatch' | 'scope-mismatch' | 'output-invalid' | 'claim-lost';

  constructor(executionId: string, reason: AgentRunConflictError['reason']) {
    super(`Agent run ${executionId} conflict: ${reason}.`);
    this.executionId = executionId;
    this.reason = reason;
  }
}
