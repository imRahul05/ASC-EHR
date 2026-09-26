import { NoObjectGeneratedError } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { AgentCallParams } from '../gateway.js';
import { AgentExecutionError, NoCapableModelError, NoCompliantModelError } from '../errors.js';
import { Capability, Reasoning, Task } from '../../config/index.js';
import {
  FixtureModels,
  apiError,
  callCount,
  createFixture,
  createTestGateway,
  failWith,
  respondWith,
} from '../../testing/fixtures.js';

const messages: AgentCallParams['messages'] = [{ role: 'user', content: 'synthetic, non-PHI test prompt' }];

describe('gateway fallback policy', () => {
  it('falls back to the next model on a retryable error (429)', async () => {
    const fixture = createFixture({ 'a-high': failWith(apiError(429)) });
    const res = await createTestGateway(fixture).executeAgentTask({
      task: Task.General,
      reasoning: Reasoning.High,
      containsPhi: false,
      messages,
    });

    expect(res.result.text).toBe('ok');
    expect(res).toMatchObject({
      agentExecutionId: 'exec-1',
      tier: Reasoning.High,
      endpoint: 'openai',
      modelId: 'o-high',
      attempts: 2,
      containsPhi: false,
    });
    expect(callCount(fixture, 'a-high')).toBe(1);
    expect(callCount(fixture, 'o-high')).toBe(1);
  });

  it('falls back on 5xx / overloaded', async () => {
    const fixture = createFixture({
      'a-high': failWith(apiError(529)),
      'o-high': failWith(apiError(503)),
    });
    const res = await createTestGateway(fixture).executeAgentTask({
      task: Task.General,
      reasoning: Reasoning.High,
      containsPhi: false,
      messages,
    });
    expect(res.modelId).toBe('a-high-2');
    expect(res.attempts).toBe(3);
  });

  it('does NOT fall back on a non-retryable error (400) and throws immediately', async () => {
    const fixture = createFixture({ 'a-high': failWith(apiError(400)) });
    const err: unknown = await createTestGateway(fixture)
      .executeAgentTask({ task: Task.General, reasoning: Reasoning.High, containsPhi: false, messages })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AgentExecutionError);
    const execErr = err as AgentExecutionError;
    expect(execErr.attempts).toBe(1);
    expect(execErr.retryable).toBe(false);
    expect(execErr.lastEndpoint).toBe('anthropic');
    expect(execErr.agentExecutionId).toBe('exec-1');
    expect(callCount(fixture, 'o-high')).toBe(0);
    expect(callCount(fixture, 'a-high-2')).toBe(0);
  });

  it('does NOT fall back on auth errors (401/403)', async () => {
    for (const status of [401, 403]) {
      const fixture = createFixture({ 'a-high': failWith(apiError(status)) });
      await expect(
        createTestGateway(fixture).executeAgentTask({
          task: Task.General,
          reasoning: Reasoning.High,
          containsPhi: false,
          messages,
        }),
      ).rejects.toBeInstanceOf(AgentExecutionError);
      expect(callCount(fixture, 'o-high')).toBe(0);
    }
  });

  it('does NOT fall back when structured output fails validation (NoObjectGeneratedError)', async () => {
    const fixture = createFixture({ 'a-high': respondWith('not json') });
    const err: unknown = await createTestGateway(fixture)
      .executeAgentObject({
        task: Task.General,
        reasoning: Reasoning.High,
        containsPhi: false,
        messages,
        schema: z.object({ code: z.string() }),
      })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AgentExecutionError);
    expect(NoObjectGeneratedError.isInstance((err as AgentExecutionError).cause)).toBe(true);
    expect(callCount(fixture, 'o-high')).toBe(0);
  });

  it('throws the last error once the chain is exhausted', async () => {
    const fixture = createFixture({
      'a-high': failWith(apiError(429)),
      'o-high': failWith(apiError(429)),
      'a-high-2': failWith(apiError(500)),
    });
    const err: unknown = await createTestGateway(fixture)
      .executeAgentTask({ task: Task.General, reasoning: Reasoning.High, containsPhi: false, messages })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentExecutionError);
    expect((err as AgentExecutionError).attempts).toBe(3);
    expect((err as AgentExecutionError).retryable).toBe(true);
    expect((err as AgentExecutionError).lastModelId).toBe('a-high-2');
  });

  it('disableFallback tries only the primary model', async () => {
    const fixture = createFixture({ 'a-high': failWith(apiError(429)) });
    await expect(
      createTestGateway(fixture).executeAgentTask({
        task: Task.General,
        reasoning: Reasoning.High,
        containsPhi: false,
        messages,
        disableFallback: true,
      }),
    ).rejects.toBeInstanceOf(AgentExecutionError);
    expect(callCount(fixture, 'o-high')).toBe(0);
  });
});

describe('PHI / BAA routing', () => {
  it('containsPhi restricts the chain to BAA providers (skips OpenAI on fallback)', async () => {
    const fixture = createFixture({ 'a-high': failWith(apiError(429)) });
    const res = await createTestGateway(fixture).executeAgentTask({
      task: Task.General,
      reasoning: Reasoning.High,
      containsPhi: true,
      messages,
    });

    expect(res).toMatchObject({ endpoint: 'anthropic', modelId: 'a-high-2', attempts: 2, containsPhi: true });
    expect(callCount(fixture, 'o-high')).toBe(0);
  });

  it('containsPhi picks the first BAA model even when a non-BAA model is primary', async () => {
    const fixture = createFixture();
    const res = await createTestGateway(fixture).executeAgentTask({
      task: Task.Summarization,
      reasoning: Reasoning.Medium,
      containsPhi: true,
      messages,
    });
    expect(res).toMatchObject({ endpoint: 'anthropic', modelId: 'a-med', attempts: 1 });
    expect(callCount(fixture, 'o-med')).toBe(0);
    expect(callCount(fixture, 'g-med')).toBe(0);
  });

  it('throws NoCompliantModelError without calling any model when no BAA provider is in the tier', async () => {
    const fixture = createFixture();
    await expect(
      createTestGateway(fixture).executeAgentTask({
        task: Task.DataExtraction,
        reasoning: Reasoning.Low,
        containsPhi: true,
        messages,
      }),
    ).rejects.toBeInstanceOf(NoCompliantModelError);
    for (const key of Object.keys(fixture.mockModels)) {
      expect(callCount(fixture, key)).toBe(0);
    }
  });

  it('streamAgentTask also enforces the BAA filter (synchronously)', () => {
    const fixture = createFixture();
    const gateway = createTestGateway(fixture);
    expect(() =>
      gateway.streamAgentTask({ task: Task.Classification, reasoning: Reasoning.Low, containsPhi: true, messages }),
    ).toThrow(NoCompliantModelError);
  });
});

describe('task PHI policy', () => {
  it('routes PHI-handling tasks to BAA providers even when caller passes containsPhi: false', async () => {
    const fixture = createFixture({ 'a-high': failWith(apiError(429)) });
    const res = await createTestGateway(fixture).executeAgentTask({
      task: Task.MedicalCoding,
      containsPhi: false,
      messages,
    });
    expect(res).toMatchObject({ endpoint: 'anthropic', modelId: 'a-high-2', containsPhi: true });
    expect(callCount(fixture, 'o-high')).toBe(0);
  });

  it('uses the task minimum tier when no reasoning override is given', async () => {
    const fixture = createFixture();
    const res = await createTestGateway(fixture).executeAgentTask({
      task: Task.Summarization,
      containsPhi: false,
      messages,
    });
    expect(res.tier).toBe(Reasoning.Medium);
  });
});

describe('tier escalation and deprecated models', () => {
  it('uses the higher of task-implied and requested tier', async () => {
    const fixture = createFixture();
    const gateway = createTestGateway(fixture);

    // medical-coding implies high; requesting low must not downgrade.
    const coding = await gateway.executeAgentTask({
      task: Task.MedicalCoding,
      reasoning: Reasoning.Low,
      containsPhi: false,
      messages,
    });
    expect(coding.tier).toBe(Reasoning.High);
    expect(coding.modelId).toBe('a-high');
    expect(coding.task).toBe(Task.MedicalCoding);

    // data-extraction implies low; caller escalates to high.
    const extraction = await gateway.executeAgentTask({
      task: Task.DataExtraction,
      reasoning: Reasoning.High,
      containsPhi: false,
      messages,
    });
    expect(extraction.tier).toBe(Reasoning.High);
  });

  it('skips deprecated models in the chain', async () => {
    const fixture = createFixture();
    const res = await createTestGateway(fixture).executeAgentTask({
      task: Task.General,
      reasoning: Reasoning.Medium,
      containsPhi: false,
      messages,
    });
    expect(res.modelId).toBe('o-med');
    expect(res.attempts).toBe(1);
    expect(callCount(fixture, 'o-med-old')).toBe(0);
  });
});

describe('structured output', () => {
  it('returns the schema-typed output with execution metadata', async () => {
    const fixture = createFixture({ 'a-high': respondWith('{"code":"43239"}') });
    const res = await createTestGateway(fixture).executeAgentObject({
      task: Task.MedicalCoding,
      reasoning: Reasoning.High,
      containsPhi: true,
      messages,
      schema: z.object({ code: z.string() }),
    });
    const code: string = res.output.code;
    expect(code).toBe('43239');
    expect(res).toMatchObject({ agentExecutionId: 'exec-1', endpoint: 'anthropic', attempts: 1 });
  });
});

describe('model pin and capabilities', () => {
  it('a pin replaces the tier chain but the tier is still reported', async () => {
    const fixture = createFixture({ 'a-med': failWith(apiError(503)) });
    const res = await createTestGateway(fixture).executeAgentTask({
      task: Task.Classification,
      containsPhi: false,
      models: [FixtureModels.aMed, FixtureModels.aHigh],
      messages,
    });
    expect(res).toMatchObject({ tier: Reasoning.Low, modelName: 'aHigh', attempts: 2 });
    expect(callCount(fixture, 'g-low')).toBe(0);
  });

  it('requires filters the chain before any model is called', async () => {
    const fixture = createFixture();
    const gateway = createTestGateway(fixture);
    const res = await gateway.executeAgentTask({
      task: Task.General,
      reasoning: Reasoning.High,
      containsPhi: true,
      requires: [Capability.Vision],
      messages,
    });
    expect(res.modelName).toBe('aHigh2');
    expect(callCount(fixture, 'a-high')).toBe(0);

    await expect(
      gateway.executeAgentTask({ task: Task.Classification, containsPhi: false, requires: [Capability.Vision], messages }),
    ).rejects.toBeInstanceOf(NoCapableModelError);
  });

  it('AgentExecutionError carries tier and hosting target', async () => {
    const fixture = createFixture({ 'a-high': failWith(apiError(400)) });
    await expect(
      createTestGateway(fixture).executeAgentTask({ task: Task.MedicalCoding, containsPhi: true, messages }),
    ).rejects.toMatchObject({ tier: Reasoning.High, hostingTarget: 'fixture-direct' });
  });
});

describe('execution id', () => {
  it('uses the caller-supplied executionId, else generates one', async () => {
    const gateway = createTestGateway(createFixture());
    const call = { task: Task.General, containsPhi: false, messages } as const;

    expect((await gateway.executeAgentTask({ ...call, executionId: 'job-42' })).agentExecutionId).toBe('job-42');
    expect((await gateway.executeAgentTask(call)).agentExecutionId).toBe('exec-1');
    expect(gateway.streamAgentTask({ ...call, executionId: 'job-43' }).agentExecutionId).toBe('job-43');
  });

  it('is carried by AgentExecutionError', async () => {
    const fixture = createFixture({ 'o-med': failWith(apiError(400)) });
    await expect(
      createTestGateway(fixture).executeAgentTask({ task: Task.General, containsPhi: false, messages, executionId: 'job-42' }),
    ).rejects.toMatchObject({ agentExecutionId: 'job-42' });
  });
});
