/**
 * Integration tests: the Postgres AgentRunStore against the AgentRunStore
 * contract (mirrors packages/agents/src/state/__tests__/run-store.test.ts),
 * plus owner-scope and concurrency cases that only a real database can prove.
 *
 * Needs a live Postgres:  pnpm db:up && TEST_DATABASE_URL=postgres://asc:asc@localhost:5432/asc_ehr pnpm --filter @asc/db test
 * Without TEST_DATABASE_URL the suite is skipped so `pnpm test` stays green without Docker.
 * Each run migrates into its own throwaway schema and drops it afterwards.
 */

import { randomUUID } from 'node:crypto';

import type { AgentRunStart, AgentRunStore } from '@asc/agents';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPostgresAgentRunStore } from '../agent-run-store.js';
import { runMigrations, type Db } from '../client.js';
import * as schema from '../schema/index.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;
const suiteName = TEST_DATABASE_URL
  ? 'PostgresAgentRunStore (AgentRunStore contract)'
  : 'PostgresAgentRunStore (SKIPPED: set TEST_DATABASE_URL to run against Postgres, see `pnpm db:up`)';

const start: AgentRunStart = { executionId: 'job-1', agent: 'test-agent', promptVersion: '2026-01-01.1', containsPhi: true };
const stale = { staleAfterMs: 60_000 };
const meta = {
  agentExecutionId: 'job-1',
  task: 'general',
  tier: 'medium',
  containsPhi: true,
  hostingTarget: 'fixture-direct',
  endpoint: 'anthropic',
  modelName: 'aMed',
  modelId: 'a-med',
  attempts: 1,
} as const;

describeDb(suiteName, () => {
  const schemaName = `test_agent_runs_${randomUUID().replaceAll('-', '')}`;
  let client: postgres.Sql;
  let db: Db;
  let store: AgentRunStore;

  /** The database clock is `now()`, so "advancing time" moves the run's start into the past. */
  const age = async (executionId: string, ms: number) => {
    await db.execute(
      sql`UPDATE agent_runs SET started_at = started_at - (${ms}::double precision * interval '1 millisecond') WHERE execution_id = ${executionId}`,
    );
  };

  beforeAll(async () => {
    const url = TEST_DATABASE_URL as string;
    const admin = postgres(url, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE SCHEMA "${schemaName}"`);
    await admin.end();

    client = postgres(url, { max: 20, onnotice: () => {}, connection: { search_path: schemaName } });
    db = drizzle(client, { schema });
    await runMigrations(db, { migrationsSchema: schemaName });
    store = createPostgresAgentRunStore(db);
  });

  afterAll(async () => {
    if (!client) return;
    await client.unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await client.end();
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE agent_runs`);
  });

  it('migrates into the isolated schema', async () => {
    const rows = await db.execute<{ schema: string }>(sql`SELECT current_schema() AS schema`);
    expect(rows[0]?.schema).toBe(schemaName);
  });

  it('begin claims a new run once; a second begin returns it unclaimed', async () => {
    expect(await store.begin(start, stale)).toMatchObject({ claimed: true, record: { status: 'running', claim: 1 } });
    expect(await store.begin(start, stale)).toMatchObject({ claimed: false, record: { status: 'running', claim: 1 } });
  });

  it('a new record has the reference shape: ISO timestamps, no null optional fields', async () => {
    const { record } = await store.begin(start, stale);
    expect(record).toEqual({
      ...start,
      status: 'running',
      claim: 1,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      startedAt: record.createdAt,
      updatedAt: record.createdAt,
    });
    expect(await store.get('job-1')).toEqual(record);
  });

  it('a succeeded run is never re-claimed, and replays its output and meta', async () => {
    await store.begin(start, stale);
    expect(await store.succeed('job-1', { claim: 1, output: { answer: 'x', items: [1, 2] }, meta })).toBe(true);
    await age('job-1', 60 * 60_000);
    const again = await store.begin(start, stale);
    expect(again).toMatchObject({
      claimed: false,
      record: { status: 'succeeded', output: { answer: 'x', items: [1, 2] }, meta },
    });
    expect(again.record.finishedAt).toEqual(expect.any(String));
  });

  it('stores output as a JSON object, not a double-encoded string', async () => {
    await store.begin(start, stale);
    await store.succeed('job-1', { claim: 1, output: { answer: 'x' }, meta });
    const rows = await db.execute<{ type: string }>(
      sql`SELECT jsonb_typeof(output) AS type FROM agent_runs WHERE execution_id = 'job-1'`,
    );
    expect(rows[0]?.type).toBe('object');
  });

  it('a failed run is re-claimed with claim + 1 and its failure cleared', async () => {
    await store.begin(start, stale);
    await store.fail('job-1', { claim: 1, failureKind: 'provider', errorName: 'AgentExecutionError' });
    expect(await store.get('job-1')).toMatchObject({ status: 'failed', failureKind: 'provider', errorName: 'AgentExecutionError' });

    const again = await store.begin({ ...start, promptVersion: '2026-01-02.1' }, stale);
    expect(again).toMatchObject({ claimed: true, record: { status: 'running', claim: 2, promptVersion: '2026-01-02.1' } });
    expect(again.record).not.toHaveProperty('failureKind');
    expect(again.record).not.toHaveProperty('errorName');
    expect(again.record).not.toHaveProperty('finishedAt');
  });

  it('a running run is re-claimed only once stale', async () => {
    await store.begin(start, stale);
    await age('job-1', 30_000);
    expect((await store.begin(start, stale)).claimed).toBe(false);
    await age('job-1', 31_000);
    expect(await store.begin(start, stale)).toMatchObject({ claimed: true, record: { claim: 2 } });
  });

  it('a takeover refreshes start fields and keeps createdAt', async () => {
    const first = await store.begin(start, stale);
    await age('job-1', 61_000);
    const aged = await store.get('job-1');
    const second = await store.begin(start, stale);
    expect(second.claimed).toBe(true);
    expect(second.record.createdAt).toBe(first.record.createdAt);
    expect(Date.parse(second.record.startedAt)).toBeGreaterThan(Date.parse(aged?.startedAt ?? ''));
  });

  it('the claim fences writes: a superseded caller cannot finish the run', async () => {
    await store.begin(start, stale);
    await age('job-1', 61_000);
    await store.begin(start, stale); // taken over: claim 2

    expect(await store.succeed('job-1', { claim: 1, output: { answer: 'late' }, meta })).toBe(false);
    expect(await store.fail('job-1', { claim: 1, failureKind: 'timeout', errorName: 'X' })).toBe(false);
    expect(await store.get('job-1')).toMatchObject({ status: 'running', claim: 2 });
    expect(await store.succeed('job-1', { claim: 2, output: { answer: 'ok' }, meta })).toBe(true);
  });

  it('a finished run cannot be finished again', async () => {
    await store.begin(start, stale);
    expect(await store.succeed('job-1', { claim: 1, output: { answer: 'x' }, meta })).toBe(true);
    expect(await store.fail('job-1', { claim: 1, failureKind: 'timeout', errorName: 'X' })).toBe(false);
    expect(await store.succeed('job-1', { claim: 1, output: { answer: 'y' }, meta })).toBe(false);
    expect(await store.get('job-1')).toMatchObject({ status: 'succeeded', output: { answer: 'x' } });
  });

  it('succeed / fail on an unknown run return false; get returns undefined', async () => {
    expect(await store.succeed('nope', { claim: 1, output: {}, meta })).toBe(false);
    expect(await store.fail('nope', { claim: 1, failureKind: 'unknown', errorName: 'X' })).toBe(false);
    expect(await store.get('nope')).toBeUndefined();
  });

  it('never claims a record of another agent', async () => {
    await store.begin(start, stale);
    await store.fail('job-1', { claim: 1, failureKind: 'provider', errorName: 'X' });
    expect(await store.begin({ ...start, agent: 'other-agent' }, stale)).toMatchObject({
      claimed: false,
      record: { agent: 'test-agent', status: 'failed' },
    });
  });

  it('never claims a record for another org, patient or case (including null vs set)', async () => {
    const scoped: AgentRunStart = { ...start, orgId: 'org-1', patientId: 'pat-1', surgicalCaseId: 'case-1' };
    await store.begin(scoped, stale);
    await store.fail('job-1', { claim: 1, failureKind: 'provider', errorName: 'X' });

    for (const other of [
      { ...scoped, orgId: 'org-2' },
      { ...scoped, patientId: 'pat-2' },
      { ...scoped, surgicalCaseId: 'case-2' },
      { ...scoped, surgicalCaseId: undefined },
      { ...start },
    ]) {
      expect(await store.begin(other, stale)).toMatchObject({
        claimed: false,
        record: { status: 'failed', claim: 1, orgId: 'org-1', patientId: 'pat-1', surgicalCaseId: 'case-1' },
      });
    }

    // Also when stale-running: another owner never takes it over.
    await db.execute(sql`UPDATE agent_runs SET status = 'running'`);
    await age('job-1', 61_000);
    expect((await store.begin({ ...scoped, patientId: 'pat-2' }, stale)).claimed).toBe(false);

    // The same owner (all ids equal) does.
    expect(await store.begin(scoped, stale)).toMatchObject({ claimed: true, record: { claim: 2, patientId: 'pat-1' } });
  });

  it('matches unscoped owners (all ids null) with IS NOT DISTINCT FROM', async () => {
    await store.begin(start, stale);
    await store.fail('job-1', { claim: 1, failureKind: 'provider', errorName: 'X' });
    expect(await store.begin(start, stale)).toMatchObject({ claimed: true, record: { claim: 2 } });
    expect(await store.begin({ ...start, orgId: 'org-1' }, stale)).toMatchObject({ claimed: false });
  });

  it('round-trips the context manifest', async () => {
    const contextManifest = [{ key: 'labs.inr', contentHash: 'abc' }] as unknown as AgentRunStart['contextManifest'];
    const { record } = await store.begin({ ...start, contextManifest }, stale);
    expect(record.contextManifest).toEqual(contextManifest);
    expect((await store.get('job-1'))?.contextManifest).toEqual(contextManifest);
  });

  it('returns copies: mutating a result does not change the store', async () => {
    const { record } = await store.begin(start, stale);
    record.status = 'succeeded';
    expect((await store.get('job-1'))?.status).toBe('running');
  });

  it('concurrent begin for a new id: exactly one caller claims', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => store.begin(start, stale)));
    expect(results.filter((r) => r.claimed)).toHaveLength(1);
    expect(results.every((r) => r.record.claim === 1)).toBe(true);
  });

  it('concurrent begin on a failed run: exactly one caller takes it over', async () => {
    await store.begin(start, stale);
    await store.fail('job-1', { claim: 1, failureKind: 'provider', errorName: 'X' });
    const results = await Promise.all(Array.from({ length: 20 }, () => store.begin(start, stale)));
    expect(results.filter((r) => r.claimed)).toHaveLength(1);
    expect(await store.get('job-1')).toMatchObject({ status: 'running', claim: 2 });
  });

  it('concurrent begin on a stale run: exactly one caller takes it over', async () => {
    await store.begin(start, stale);
    await age('job-1', 61_000);
    const results = await Promise.all(Array.from({ length: 20 }, () => store.begin(start, stale)));
    expect(results.filter((r) => r.claimed)).toHaveLength(1);
    expect(await store.get('job-1')).toMatchObject({ status: 'running', claim: 2 });
  });
});
