import { NoObjectGeneratedError } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createGateway, type AgentCallParams } from '../gateway.js';
import { AgentExecutionError, NoCompliantModelError } from '../errors.js';
import { Reasoning, Task } from '../config/index.js';
import { apiError, callCount, createFixture, failWith, respondWith } from './fixtures.js';

const messages: AgentCallParams['messages'] = [{ role: 'user', content: 'synthetic, non-PHI test prompt' }];

function gatewayFor(fixture: ReturnType<typeof createFixture>) {
  let n = 0;
  return createGateway({
    hosting: fixture.hosting,
    routing: fixture.routing,
    maxRetriesPerModel: 0, // no SDK backoff in tests
    generateExecutionId: () => `exec-${++n}`,
  });
}

describe('gateway fallback policy', () => {
  it('falls back to the next model on a retryable error (429)', async () => {
    const fixture = createFixture({ 'a-high': failWith(apiError(429)) });
    const res = await gatewayFor(fixture).executeAgentTask({
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
    const res = await gatewayFor(fixture).executeAgentTask({
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
    const err: unknown = await gatewayFor(fixture)
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
        gatewayFor(fixture).executeAgentTask({
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
    const err: unknown = await gatewayFor(fixture)
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
    const err: unknown = await gatewayFor(fixture)
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
      gatewayFor(fixture).executeAgentTask({
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
    const res = await gatewayFor(fixture).executeAgentTask({
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
    const res = await gatewayFor(fixture).executeAgentTask({
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
      gatewayFor(fixture).executeAgentTask({
        task: Task.DataExtraction,
        reasoning: Reasoning.Low,
        containsPhi: true,
        messages,
      }),
    ).rejects.toBeInstanceOf(NoCompliantModelError);
    for (const key of Object.keys(fixture.models)) {
      expect(callCount(fixture, key)).toBe(0);
    }
  });

  it('streamAgentTask also enforces the BAA filter (synchronously)', () => {
    const fixture = createFixture();
    const gateway = gatewayFor(fixture);
    expect(() =>
      gateway.streamAgentTask({ task: Task.Classification, reasoning: Reasoning.Low, containsPhi: true, messages }),
    ).toThrow(NoCompliantModelError);
  });
});

describe('task PHI policy', () => {
  it('routes PHI-handling tasks to BAA providers even when caller passes containsPhi: false', async () => {
    const fixture = createFixture({ 'a-high': failWith(apiError(429)) });
    const res = await gatewayFor(fixture).executeAgentTask({
      task: Task.MedicalCoding,
      containsPhi: false,
      messages,
    });
    expect(res).toMatchObject({ endpoint: 'anthropic', modelId: 'a-high-2', containsPhi: true });
    expect(callCount(fixture, 'o-high')).toBe(0);
  });

  it('uses the task minimum tier when no reasoning override is given', async () => {
    const fixture = createFixture();
    const res = await gatewayFor(fixture).executeAgentTask({
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
    const gateway = gatewayFor(fixture);

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
    const res = await gatewayFor(fixture).executeAgentTask({
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
    const res = await gatewayFor(fixture).executeAgentObject({
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
