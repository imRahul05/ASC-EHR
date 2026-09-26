/**
 * Postgres implementation of `AgentRunStore` (@asc/agents). Semantics match the
 * in-memory reference (`packages/agents/src/testing/run-store.ts`); time comes
 * from the database (`now()`), so every caller shares one clock.
 *
 * PHI: `agent_runs.output` holds model output. Never log records or outputs.
 */

import type { AgentRunBeginResult, AgentRunRecord, AgentRunStart, AgentRunStore } from '@asc/agents';
import { and, eq, sql } from 'drizzle-orm';

import type { Db } from './client.js';
import { agentRuns, type AgentRunRow } from './schema/agent-runs.js';

export function createPostgresAgentRunStore(db: Db): AgentRunStore {
  async function finish(
    executionId: string,
    claim: number,
    update: Partial<Pick<AgentRunRow, 'status' | 'output' | 'meta' | 'failureKind' | 'errorName'>>,
  ): Promise<boolean> {
    const rows = await db
      .update(agentRuns)
      .set({ ...update, updatedAt: sql`now()`, finishedAt: sql`now()` })
      .where(
        and(eq(agentRuns.executionId, executionId), eq(agentRuns.status, 'running'), eq(agentRuns.claim, claim)),
      )
      .returning({ executionId: agentRuns.executionId });
    return rows.length > 0;
  }

  return {
    async begin(start: AgentRunStart, { staleAfterMs }: { staleAfterMs: number }): Promise<AgentRunBeginResult> {
      // One atomic statement: insert a new run (claim 1), or — only for the same
      // owner, and only when the run failed or went stale — take it over
      // (claim + 1, start fields refreshed, previous outcome cleared). Concurrent
      // callers serialize on the row lock and re-check the WHERE against the
      // updated row, so exactly one of them claims.
      const claimed = await db
        .insert(agentRuns)
        .values({
          executionId: start.executionId,
          agent: start.agent,
          promptVersion: start.promptVersion,
          status: 'running',
          claim: 1,
          containsPhi: start.containsPhi,
          orgId: start.orgId ?? null,
          patientId: start.patientId ?? null,
          surgicalCaseId: start.surgicalCaseId ?? null,
          contextManifest: start.contextManifest ?? null,
          createdAt: sql`now()`,
          startedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .onConflictDoUpdate({
          target: agentRuns.executionId,
          set: {
            promptVersion: sql`excluded.prompt_version`,
            containsPhi: sql`excluded.contains_phi`,
            contextManifest: sql`excluded.context_manifest`,
            status: 'running',
            claim: sql`${agentRuns.claim} + 1`,
            startedAt: sql`now()`,
            updatedAt: sql`now()`,
            finishedAt: sql`NULL`,
            output: sql`NULL`,
            meta: sql`NULL`,
            failureKind: sql`NULL`,
            errorName: sql`NULL`,
          },
          setWhere: sql`${agentRuns.agent} = excluded.agent
            AND ${agentRuns.orgId} IS NOT DISTINCT FROM excluded.org_id
            AND ${agentRuns.patientId} IS NOT DISTINCT FROM excluded.patient_id
            AND ${agentRuns.surgicalCaseId} IS NOT DISTINCT FROM excluded.surgical_case_id
            AND (
              ${agentRuns.status} = 'failed'
              OR (${agentRuns.status} = 'running'
                AND ${agentRuns.startedAt} < now() - (${staleAfterMs}::double precision * interval '1 millisecond'))
            )`,
        })
        .returning();

      const row = claimed[0];
      if (row) return { claimed: true, record: toRecord(row) };

      // Not claimed: succeeded, running and fresh, or another owner. The row
      // exists (the conflict proved it) and rows are never deleted by the store.
      const existing = await db.select().from(agentRuns).where(eq(agentRuns.executionId, start.executionId));
      if (!existing[0]) throw new Error(`Agent run ${start.executionId} vanished during begin.`);
      return { claimed: false, record: toRecord(existing[0]) };
    },

    succeed(executionId, { claim, output, meta }) {
      return finish(executionId, claim, { status: 'succeeded', output, meta });
    },

    fail(executionId, { claim, failureKind, errorName }) {
      return finish(executionId, claim, { status: 'failed', failureKind, errorName });
    },

    async get(executionId) {
      const rows = await db.select().from(agentRuns).where(eq(agentRuns.executionId, executionId));
      return rows[0] && toRecord(rows[0]);
    },
  };
}

/** Row → record in the reference shape: ISO timestamps, absent (not null) optional fields. */
function toRecord(row: AgentRunRow): AgentRunRecord {
  const record: AgentRunRecord = {
    executionId: row.executionId,
    agent: row.agent,
    promptVersion: row.promptVersion,
    containsPhi: row.containsPhi,
    status: row.status,
    claim: row.claim,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (row.orgId !== null) record.orgId = row.orgId;
  if (row.patientId !== null) record.patientId = row.patientId;
  if (row.surgicalCaseId !== null) record.surgicalCaseId = row.surgicalCaseId;
  if (row.contextManifest !== null) record.contextManifest = row.contextManifest;
  if (row.finishedAt !== null) record.finishedAt = row.finishedAt.toISOString();
  if (row.output !== null) record.output = row.output;
  if (row.meta !== null) record.meta = row.meta;
  if (row.failureKind !== null) record.failureKind = row.failureKind;
  if (row.errorName !== null) record.errorName = row.errorName;
  return record;
}
