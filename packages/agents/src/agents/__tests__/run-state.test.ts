import { sanitizeDetails } from '@asc/audit';
import { describe, expect, it } from 'vitest';

import { AgentExecutionError } from '../../runtime/errors.js';
import { AgentRunConflictError, AgentRunInProgressError } from '../../state/run-store.js';
import {
  apiError,
  callCount,
  createAuditRecorder,
  createFixture,
  createTestGateway,
  defineTestAgent,
  failOnceThen,
  failWith,
  respondWith,
} from '../../testing/fixtures.js';
import { InMemoryAgentRunStore } from '../../testing/run-store.js';
import { AGENT_RUN_ACTION, AGENT_RUN_REPLAY_ACTION, runAgent, type RunAgentOptions } from '../run.js';

const agent = defineTestAgent();
const input = { topic: 'synthetic' };

/** `o-med` answers first (non-PHI medium tier); `now` drives the store's clock. */
function setup(behaviour: Parameters<typeof createFixture>[0] = { 'o-med': respondWith('{"answer":"CANARY-OUTPUT"}') }) {
  const fixture = createFixture(behaviour);
  const audit = createAuditRecorder();
  const clock = { now: new Date('2026-09-26T12:00:00.000Z') };
  const runStore = new InMemoryAgentRunStore({ now: () => clock.now });
  const options: RunAgentOptions = {
    actor: { type: 'system', id: 'worker' },
    containsPhi: false,
    surgicalCaseId: 'case-1',
    gateway: createTestGateway(fixture),
    audit,
    runStore,
    executionId: 'job-123',
  };
  return { fixture, audit, runStore, clock, options };
}

function modelCalls(fixture: ReturnType<typeof createFixture>): number {
  return Object.values(fixture.mockModels).reduce((n, m) => n + m.doGenerateCalls.length, 0);
}

describe('runAgent — executionId', () => {
  it('is used as agentExecutionId in meta and audit (without a run store too)', async () => {
    const { audit, options } = setup();
    const res = await runAgent(agent, input, { ...options, runStore: undefined });

    expect(res.meta.agentExecutionId).toBe('job-123');
    expect(audit.events).toMatchObject([{ action: AGENT_RUN_ACTION, outcome: 'SUCCESS', agentExecutionId: 'job-123' }]);
  });

  it('is on the FAILURE audit event when the model fails', async () => {
    const { audit, options } = setup({ 'o-med': failWith(apiError(400)) });
    await expect(runAgent(agent, input, options)).rejects.toBeInstanceOf(AgentExecutionError);
    expect(audit.events).toMatchObject([{ outcome: 'FAILURE', agentExecutionId: 'job-123' }]);
  });
});

describe('runAgent — run store', () => {
  it('records a succeeded run with output, served model and claim', async () => {
    const { audit, runStore, options } = setup();
    await runAgent(agent, input, options);

    expect(await runStore.get('job-123')).toMatchObject({
      executionId: 'job-123',
      agent: 'test-agent',
      promptVersion: '2026-01-01.1',
      status: 'succeeded',
      claim: 1,
      containsPhi: false,
      surgicalCaseId: 'case-1',
      output: { answer: 'CANARY-OUTPUT' },
      meta: { agentExecutionId: 'job-123', modelId: 'o-med', attempts: 1, usage: { totalTokens: 2 } },
      finishedAt: '2026-09-26T12:00:00.000Z',
    });
    expect(audit.events[0]?.details).toMatchObject({ runClaim: 1 });
  });

  it('idempotent replay: a succeeded run returns the stored output with zero model calls', async () => {
    const { fixture, audit, options } = setup();
    const first = await runAgent(agent, input, options);
    const callsAfterFirst = modelCalls(fixture);
    const second = await runAgent(agent, input, options);

    expect(callsAfterFirst).toBe(1);
    expect(modelCalls(fixture)).toBe(1);
    expect(second.output).toEqual(first.output);
    expect(second.meta).toEqual({ ...first.meta, replayed: true });

    // Exactly one agent.run SUCCESS; the replay is its own action, with no token usage.
    expect(audit.events.map((e) => [e.action, e.outcome])).toEqual([
      [AGENT_RUN_ACTION, 'SUCCESS'],
      [AGENT_RUN_REPLAY_ACTION, 'SUCCESS'],
    ]);
    const replay = audit.events[1];
    expect(replay).toMatchObject({
      agentExecutionId: 'job-123',
      details: { replayed: true, attempts: 0, modelId: 'o-med', promptVersion: '2026-01-01.1' },
    });
    expect(replay?.details).not.toHaveProperty('totalTokens');
    expect(() => sanitizeDetails(replay?.details, false)).not.toThrow();
    expect(JSON.stringify(audit.events)).not.toContain('CANARY');
  });

  it('a run in progress elsewhere throws AgentRunInProgressError without calling a model', async () => {
    const { fixture, audit, runStore, options } = setup();
    await runStore.begin(
      { executionId: 'job-123', agent: 'test-agent', promptVersion: '2026-01-01.1', containsPhi: false, surgicalCaseId: 'case-1' },
      { staleAfterMs: 60_000 },
    );

    await expect(runAgent(agent, input, options)).rejects.toBeInstanceOf(AgentRunInProgressError);
    expect(modelCalls(fixture)).toBe(0);
    expect(await runStore.get('job-123')).toMatchObject({ status: 'running', claim: 1 });
    expect(audit.events).toMatchObject([
      {
        outcome: 'FAILURE',
        agentExecutionId: 'job-123',
        details: { errorName: 'AgentRunInProgressError', failureKind: 'run-state', attempts: 0 },
      },
    ]);
  });

  it('two concurrent calls with one executionId call the model once', async () => {
    const { fixture, options } = setup();
    const results = await Promise.allSettled([runAgent(agent, input, options), runAgent(agent, input, options)]);

    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(AgentRunInProgressError);
    expect(modelCalls(fixture)).toBe(1);
  });

  it('a stale running record (crashed worker) is taken over', async () => {
    const { fixture, runStore, clock, options } = setup();
    await runStore.begin(
      { executionId: 'job-123', agent: 'test-agent', promptVersion: '2026-01-01.1', containsPhi: false, surgicalCaseId: 'case-1' },
      { staleAfterMs: 60_000 },
    );
    clock.now = new Date(clock.now.getTime() + 2 * 60_000);

    const res = await runAgent(agent, input, { ...options, staleRunAfterMs: 60_000 });
    expect(res.output).toEqual({ answer: 'CANARY-OUTPUT' });
    expect(modelCalls(fixture)).toBe(1);
    expect(await runStore.get('job-123')).toMatchObject({ status: 'succeeded', claim: 2 });
  });

  it('a failed run is retried under the same id and the record updated', async () => {
    // The provider rejects the first call (400) and recovers for the retry.
    const { fixture, audit, runStore, options } = setup({
      'o-med': failOnceThen(apiError(400), '{"answer":"CANARY-OUTPUT"}'),
    });
    await expect(runAgent(agent, input, options)).rejects.toBeInstanceOf(AgentExecutionError);
    expect(await runStore.get('job-123')).toMatchObject({
      status: 'failed',
      claim: 1,
      failureKind: 'provider',
      errorName: 'AgentExecutionError',
    });

    // The job retries with the same id.
    const res = await runAgent(agent, input, options);

    expect(res.meta).toMatchObject({ agentExecutionId: 'job-123' });
    expect(res.meta).not.toHaveProperty('replayed');
    expect(callCount(fixture, 'o-med')).toBe(2);
    const stored = await runStore.get('job-123');
    expect(stored).toMatchObject({ status: 'succeeded', claim: 2, output: { answer: 'CANARY-OUTPUT' } });
    expect(stored).not.toHaveProperty('failureKind');
    expect(audit.events.map((e) => e.outcome)).toEqual(['FAILURE', 'SUCCESS']);
    expect(audit.events[1]?.details).toMatchObject({ runClaim: 2 });
  });

  it('an execution id of another agent is a conflict, not a replay', async () => {
    const { fixture, audit, options } = setup();
    await runAgent(agent, input, options);
    const other = defineTestAgent({ name: 'other-agent' });

    await expect(runAgent(other, input, options)).rejects.toMatchObject({
      name: 'AgentRunConflictError',
      reason: 'agent-mismatch',
    });
    expect(modelCalls(fixture)).toBe(1);
    expect(audit.events[1]).toMatchObject({ outcome: 'FAILURE', details: { failureKind: 'run-state' } });
  });

  it('an execution id of another case is a conflict: its output (PHI) is never replayed', async () => {
    const { fixture, audit, runStore, options } = setup();
    await runAgent(agent, input, options);

    await expect(runAgent(agent, input, { ...options, surgicalCaseId: 'case-2' })).rejects.toMatchObject({
      name: 'AgentRunConflictError',
      reason: 'scope-mismatch',
    });
    expect(modelCalls(fixture)).toBe(1);
    expect(audit.events.map((e) => e.action)).not.toContain(AGENT_RUN_REPLAY_ACTION);
    expect(audit.events[1]).toMatchObject({ outcome: 'FAILURE', details: { failureKind: 'run-state' } });
    expect(await runStore.get('job-123')).toMatchObject({ status: 'succeeded', surgicalCaseId: 'case-1' });
  });

  it('a failed run of another case is not taken over', async () => {
    const { fixture, runStore, options } = setup({ 'o-med': failOnceThen(apiError(400), '{"answer":"CANARY-OUTPUT"}') });
    await expect(runAgent(agent, input, options)).rejects.toBeInstanceOf(AgentExecutionError);

    await expect(runAgent(agent, input, { ...options, surgicalCaseId: 'case-2' })).rejects.toMatchObject({
      reason: 'scope-mismatch',
    });
    expect(modelCalls(fixture)).toBe(1);
    expect(await runStore.get('job-123')).toMatchObject({ status: 'failed', surgicalCaseId: 'case-1', claim: 1 });
  });

  it('a stored output that no longer matches the schema is never replayed', async () => {
    const { runStore, options } = setup();
    await runAgent(agent, input, options);
    const stored = runStore.records.get('job-123');
    if (stored) stored.output = { unexpected: true };

    const err: unknown = await runAgent(agent, input, options).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentRunConflictError);
    expect((err as AgentRunConflictError).reason).toBe('output-invalid');
  });

  it('a run store without executionId still records the run under a generated id', async () => {
    const { runStore, options } = setup();
    const res = await runAgent(agent, input, { ...options, executionId: undefined });

    expect(res.meta.agentExecutionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await runStore.get(res.meta.agentExecutionId)).toMatchObject({ status: 'succeeded' });
  });

  it('does not touch the store when the input is invalid', async () => {
    const { runStore, options } = setup();
    // @ts-expect-error — deliberately invalid input
    await expect(runAgent(agent, { topic: 7 }, options)).rejects.toThrow(/Invalid input/);
    expect(await runStore.get('job-123')).toBeUndefined();
  });
});
