import { sanitizeDetails } from '@asc/audit';
import { describe, expect, it } from 'vitest';

import { Task } from '../../config/index.js';
import { AgentExecutionError, NoCompliantModelError } from '../../runtime/errors.js';
import {
  FixtureModels,
  apiError,
  callCount,
  createAuditRecorder,
  createFixture,
  createTestGateway,
  defineTestAgent,
  failWith,
  hang,
  refuse,
  respondWith,
} from '../../testing/fixtures.js';
import { AgentInputError, runAgent, type RunAgentOptions } from '../run.js';

function setup(behaviour: Parameters<typeof createFixture>[0] = {}) {
  const fixture = createFixture(behaviour);
  const audit = createAuditRecorder();
  const options: RunAgentOptions = {
    actor: { type: 'user', id: 'user-1' },
    containsPhi: false,
    surgicalCaseId: 'case-1',
    gateway: createTestGateway(fixture),
    audit,
  };
  return { fixture, audit, options };
}

/** Throws in the same way @asc/audit does outside production if details are not PHI-safe. */
function expectPhiSafeDetails(details: Record<string, unknown> | undefined): void {
  expect(() => sanitizeDetails(details, false)).not.toThrow();
}

describe('runAgent', () => {
  it('returns typed output with gateway metadata, agent name and prompt version', async () => {
    const { options } = setup({ 'o-med': respondWith('{"answer":"42"}') });
    const res = await runAgent(defineTestAgent(), { topic: 'synthetic' }, options);

    expect(res.output).toEqual({ answer: '42' });
    expect(res.meta).toMatchObject({
      agent: 'test-agent',
      promptVersion: '2026-01-01.1',
      agentExecutionId: 'exec-1',
      modelName: 'oMed',
      attempts: 1,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });
  });

  it('audits success with numeric token usage only', async () => {
    const { audit, options } = setup({ 'o-med': respondWith('{"answer":"42"}') });
    await runAgent(defineTestAgent(), { topic: 'synthetic' }, options);

    const [event] = audit.events;
    expect(event).toMatchObject({
      outcome: 'SUCCESS',
      details: { modelId: 'o-med', attempts: 1, inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });
    // The provider reported no cache reads: the key is omitted, never undefined.
    expect(event?.details).not.toHaveProperty('cachedInputTokens');
    expectPhiSafeDetails(event?.details);
  });

  it('a refusal is audited as failureKind "refusal" and never reaches a second model', async () => {
    const { fixture, audit, options } = setup({ 'o-med': refuse() });
    await expect(runAgent(defineTestAgent(), { topic: 'synthetic' }, options)).rejects.toBeInstanceOf(
      AgentExecutionError,
    );

    expect(callCount(fixture, 'a-med')).toBe(0);
    expect(callCount(fixture, 'g-med')).toBe(0);
    const [event] = audit.events;
    expect(event).toMatchObject({
      outcome: 'FAILURE',
      details: { failureKind: 'refusal', retryable: false, attempts: 1, modelId: 'o-med' },
    });
    expectPhiSafeDetails(event?.details);
  });

  it('audits a timeout as failureKind "timeout" with the deadline flag', async () => {
    const { fixture, audit, options } = setup({ 'o-med': hang() });
    const gateway = createTestGateway(fixture, { latencyBudget: { attemptTimeoutMs: 5_000, totalTimeoutMs: 20 } });
    await expect(
      runAgent(defineTestAgent(), { topic: 'synthetic' }, { ...options, gateway }),
    ).rejects.toBeInstanceOf(AgentExecutionError);

    expect(audit.events[0]?.details).toMatchObject({ failureKind: 'timeout', deadlineExceeded: true, attempts: 1 });
    expect(callCount(fixture, 'a-med')).toBe(0);
    expectPhiSafeDetails(audit.events[0]?.details);
  });

  it('uses the agent model pin', async () => {
    const { fixture, options } = setup({ 'a-high-2': respondWith('{"answer":"x"}') });
    const agent = defineTestAgent({ models: [FixtureModels.aHigh2] });
    const res = await runAgent(agent, { topic: 'synthetic' }, options);

    expect(res.meta).toMatchObject({ modelName: 'aHigh2', tier: 'medium' });
    expect(callCount(fixture, 'o-med')).toBe(0);
  });

  it('rejects invalid input with field paths only, without calling a model', async () => {
    const { fixture, audit, options } = setup();
    const err: unknown = await runAgent(
      defineTestAgent(),
      // @ts-expect-error — deliberately invalid: wrong type plus an extra identifier field
      { topic: 7, patientName: 'Synthetic Name' },
      options,
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AgentInputError);
    expect((err as AgentInputError).fields).toEqual(['topic', 'patientName']);
    expect((err as AgentInputError).message).not.toContain('Synthetic Name');
    expect(Object.values(fixture.mockModels).every((m) => m.doGenerateCalls.length === 0)).toBe(true);
    expect(audit.events).toMatchObject([
      {
        outcome: 'FAILURE',
        agentExecutionId: undefined,
        details: { errorName: 'AgentInputError', failureKind: 'input', attempts: 0 },
      },
    ]);
  });

  it('audits a model failure with the execution id and last model', async () => {
    const { audit, options } = setup({ 'o-med': failWith(apiError(400)) });
    await expect(runAgent(defineTestAgent(), { topic: 'synthetic' }, options)).rejects.toBeInstanceOf(
      AgentExecutionError,
    );

    const [event] = audit.events;
    expect(event).toMatchObject({
      action: 'agent.run',
      actorType: 'agent',
      actorId: 'test-agent',
      agentExecutionId: 'exec-1',
      surgicalCaseId: 'case-1',
      outcome: 'FAILURE',
      details: {
        agent: 'test-agent',
        triggeredByType: 'user',
        triggeredById: 'user-1',
        errorName: 'AgentExecutionError',
        failureKind: 'provider',
        tier: 'medium',
        hostingTarget: 'fixture-direct',
        endpoint: 'openai',
        modelId: 'o-med',
        attempts: 1,
        retryable: false,
      },
    });
    expectPhiSafeDetails(event?.details);
  });

  it('audits a routing refusal (no BAA model) before any model is called', async () => {
    const { audit, options } = setup();
    const agent = defineTestAgent({ task: Task.MedicalCoding, models: [FixtureModels.oHigh] });
    await expect(runAgent(agent, { topic: 'synthetic' }, options)).rejects.toBeInstanceOf(NoCompliantModelError);
    expect(audit.events[0]?.details).toMatchObject({
      errorName: 'NoCompliantModelError',
      failureKind: 'no-model',
      tier: 'high',
      attempts: 0,
    });
  });

  it('propagates an audit write failure (audit loss is never silent)', async () => {
    const { options } = setup({ 'o-med': respondWith('{"answer":"42"}') });
    const failingAudit = { logEvent: () => Promise.reject(new Error('audit store down')) };
    await expect(
      runAgent(defineTestAgent(), { topic: 'synthetic' }, { ...options, audit: failingAudit }),
    ).rejects.toThrow('audit store down');
  });
});
