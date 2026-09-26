import type { AgentExecutionMeta, AgentFailureKind, ContextManifestEntry } from '@asc/agents';
import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const AGENT_RUN_STATUSES = ['running', 'succeeded', 'failed'] as const;

/**
 * Execution state for `runAgent`: one row per `executionId` (see the
 * `AgentRunStore` contract in @asc/agents, src/state/run-store.ts).
 *
 * Contains PHI (`output`): encrypted at rest, TLS in transit, least-privilege
 * role. Never copy rows to Redis, job payloads, logs, telemetry or audit details.
 */
export const agentRuns = pgTable(
  'agent_runs',
  {
    executionId: text('execution_id').primaryKey(),
    agent: text('agent').notNull(),
    promptVersion: text('prompt_version').notNull(),
    status: text('status', { enum: AGENT_RUN_STATUSES }).notNull(),
    /** Fencing token: incremented on every claim; `succeed` / `fail` require the current value. */
    claim: integer('claim').notNull(),
    containsPhi: boolean('contains_phi').notNull(),
    /** Internal ids only. Null = not scoped to that level; owner checks use IS NOT DISTINCT FROM. */
    orgId: text('org_id'),
    patientId: text('patient_id'),
    surgicalCaseId: text('surgical_case_id'),
    /** Context metadata only (keys, sources, hashes) — never values. */
    contextManifest: jsonb('context_manifest').$type<readonly ContextManifestEntry[]>(),
    /** PHI. The schema-validated model output of a succeeded run, replayed on retry. */
    output: jsonb('output').$type<unknown>(),
    meta: jsonb('meta').$type<AgentExecutionMeta>(),
    /** PHI-free failure category and error class name (never messages). */
    failureKind: text('failure_kind').$type<AgentFailureKind>(),
    errorName: text('error_name'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
    /** Time of the latest claim. */
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    check('agent_runs_status_check', sql`${table.status} IN ('running', 'succeeded', 'failed')`),
    check('agent_runs_claim_check', sql`${table.claim} >= 1`),
    // Ops: find stuck / stale runs and recent failures.
    index('agent_runs_status_started_at_idx').on(table.status, table.startedAt),
  ],
);

export type AgentRunRow = typeof agentRuns.$inferSelect;
