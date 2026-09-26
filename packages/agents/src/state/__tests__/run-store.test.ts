import { describe, expect, it } from 'vitest';

import { InMemoryAgentRunStore } from '../../testing/run-store.js';
import type { AgentRunStart } from '../run-store.js';

/** The contract every AgentRunStore (e.g. the apps' Postgres store) must satisfy. */
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

function setup() {
  const clock = { now: new Date('2026-09-26T12:00:00.000Z') };
  const store = new InMemoryAgentRunStore({ now: () => clock.now });
  const advance = (ms: number) => (clock.now = new Date(clock.now.getTime() + ms));
  return { store, advance };
}

describe('InMemoryAgentRunStore (AgentRunStore contract)', () => {
  it('begin claims a new run once; a second begin returns it unclaimed', async () => {
    const { store } = setup();
    expect(await store.begin(start, stale)).toMatchObject({ claimed: true, record: { status: 'running', claim: 1 } });
    expect(await store.begin(start, stale)).toMatchObject({ claimed: false, record: { status: 'running', claim: 1 } });
  });

  it('a succeeded run is never re-claimed', async () => {
    const { store, advance } = setup();
    await store.begin(start, stale);
    expect(await store.succeed('job-1', { claim: 1, output: { answer: 'x' }, meta })).toBe(true);
    advance(60 * 60_000);
    expect(await store.begin(start, stale)).toMatchObject({ claimed: false, record: { status: 'succeeded' } });
  });

  it('a failed run is re-claimed with claim + 1 and its failure cleared', async () => {
    const { store } = setup();
    await store.begin(start, stale);
    await store.fail('job-1', { claim: 1, failureKind: 'provider', errorName: 'AgentExecutionError' });

    const again = await store.begin({ ...start, promptVersion: '2026-01-02.1' }, stale);
    expect(again).toMatchObject({ claimed: true, record: { status: 'running', claim: 2, promptVersion: '2026-01-02.1' } });
    expect(again.record).not.toHaveProperty('failureKind');
  });

  it('a running run is re-claimed only once stale', async () => {
    const { store, advance } = setup();
    await store.begin(start, stale);
    advance(30_000);
    expect((await store.begin(start, stale)).claimed).toBe(false);
    advance(31_000);
    expect(await store.begin(start, stale)).toMatchObject({ claimed: true, record: { claim: 2 } });
  });

  it('the claim fences writes: a superseded caller cannot finish the run', async () => {
    const { store, advance } = setup();
    await store.begin(start, stale);
    advance(61_000);
    await store.begin(start, stale); // taken over: claim 2

    expect(await store.succeed('job-1', { claim: 1, output: { answer: 'late' }, meta })).toBe(false);
    expect(await store.fail('job-1', { claim: 1, failureKind: 'timeout', errorName: 'X' })).toBe(false);
    expect(await store.get('job-1')).toMatchObject({ status: 'running', claim: 2 });
  });

  it('never claims a record of another agent', async () => {
    const { store } = setup();
    await store.begin(start, stale);
    await store.fail('job-1', { claim: 1, failureKind: 'provider', errorName: 'X' });
    expect(await store.begin({ ...start, agent: 'other-agent' }, stale)).toMatchObject({
      claimed: false,
      record: { agent: 'test-agent', status: 'failed' },
    });
  });

  it('returns copies: mutating a result does not change the store', async () => {
    const { store } = setup();
    const { record } = await store.begin(start, stale);
    record.status = 'succeeded';
    expect((await store.get('job-1'))?.status).toBe('running');
  });
});
