import { sanitizeDetails } from '@repo/audit';
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

/** Throws in the same way @repo/audit does outside production if details are not PHI-safe. */
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
    });
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
      { outcome: 'FAILURE', agentExecutionId: undefined, details: { errorName: 'AgentInputError', attempts: 0 } },
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
    expect(audit.events[0]?.details).toMatchObject({ errorName: 'NoCompliantModelError', tier: 'high', attempts: 0 });
  });

  it('propagates an audit write failure (audit loss is never silent)', async () => {
    const { options } = setup({ 'o-med': respondWith('{"answer":"42"}') });
    const failingAudit = { logEvent: () => Promise.reject(new Error('audit store down')) };
    await expect(
      runAgent(defineTestAgent(), { topic: 'synthetic' }, { ...options, audit: failingAudit }),
    ).rejects.toThrow('audit store down');
  });
});
