import { sanitizeDetails } from '@repo/audit';
import type { DischargeInstructionsOutput } from '@repo/validation';
import { describe, expect, it } from 'vitest';

import { Task } from '../../../config/index.js';
import {
  apiError,
  callCount,
  createAuditRecorder,
  createFixture,
  createTestGateway,
  failWith,
  respondWith,
} from '../../../testing/fixtures.js';
import { AgentInputError, runAgent, type RunAgentOptions } from '../../run.js';
import { dischargeInstructionsEvalCases } from '../evals/cases.js';
import { dischargeInstructionsAgent } from '../index.js';
import { dischargeInstructionsInputSchema, type DischargeInstructionsInput } from '../input.js';
import { PROMPT_VERSION, buildMessages } from '../prompt.js';

const [firstCase] = dischargeInstructionsEvalCases;
if (!firstCase) throw new Error('expected at least one eval case');
const input: DischargeInstructionsInput = firstCase.input;

const validOutput: DischargeInstructionsOutput = {
  language: 'en',
  summary: 'You had a colonoscopy today. It went well.',
  whatWasDone: ['A doctor looked at your large intestine with a small camera.'],
  diet: ['Start with light meals today.'],
  activity: ['Do not drive for the rest of the day.'],
  medications: [],
  warningSigns: {
    callClinic: ['Fever', 'More than a small amount of bleeding from your bottom', 'Black stools'],
    goToEmergency: ['Chest pain or trouble breathing', 'Vomiting blood', 'Severe belly pain'],
  },
  followUp: 'Repeat colonoscopy in about 10 years.',
  pathologyPending: { pending: false, message: '' },
};

/** The fixture routes medium-tier PHI calls to the BAA model `a-med`. */
function setup(modelResponse = respondWith(JSON.stringify(validOutput))) {
  const fixture = createFixture({ 'a-med': modelResponse });
  const audit = createAuditRecorder();
  const options: RunAgentOptions = {
    actor: { type: 'user', id: 'nurse-1' },
    containsPhi: true,
    patientId: 'patient-1',
    surgicalCaseId: 'case-1',
    gateway: createTestGateway(fixture),
    audit,
  };
  return { fixture, audit, options };
}

function messageText(value: DischargeInstructionsInput): string {
  return buildMessages(value)
    .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
    .join('\n');
}

describe('discharge-instructions definition', () => {
  it('is a PHI patient-instructions agent with a versioned prompt', () => {
    expect(dischargeInstructionsAgent).toMatchObject({
      name: 'discharge-instructions',
      task: Task.PatientInstructions,
      promptVersion: PROMPT_VERSION,
    });
  });

  it('rejects identifiers: the input schema is strict', () => {
    const result = dischargeInstructionsInputSchema.safeParse({ ...input, patientName: 'x', mrn: 'y' });
    expect(result.success).toBe(false);
  });
});

describe('buildMessages (minimum necessary)', () => {
  it('renders only schema fields — values smuggled past the type never reach the model', () => {
    const smuggled = { ...input, patientName: 'CANARY-NAME', mrn: 'CANARY-MRN', dob: 'CANARY-DOB' };
    const text = messageText(smuggled);
    expect(text).not.toMatch(/CANARY|patientName|mrn|dob/i);
    // Exactly one fact line per rendered field — no serialized object dumps.
    expect(text.split('\n').filter((line) => line.startsWith('- '))).toHaveLength(10);
    expect(text).not.toContain('{');
  });

  it('states whether tissue was sent for lab testing (biopsies or removed polyps)', () => {
    expect(messageText(input)).toContain('Tissue sent for lab testing: no');
    const withPolyps = { ...input, findings: { ...input.findings, polypsRemoved: 1 } };
    expect(messageText(withPolyps)).toContain('Tissue sent for lab testing: yes');
  });
});

describe('eval cases', () => {
  it.each(dischargeInstructionsEvalCases.map((c) => [c.name, c] as const))('%s: input validates', (_name, c) => {
    expect(dischargeInstructionsInputSchema.safeParse(c.input).success).toBe(true);
    expect(c.expectations.length).toBeGreaterThan(0);
  });

  it('expectations pass for a matching output and catch a wrong one', () => {
    expect(firstCase.expectations.every((e) => e.check(validOutput))).toBe(true);
    const wrong = { ...validOutput, language: 'es' as const, pathologyPending: { pending: true, message: 'x' } };
    expect(firstCase.expectations.filter((e) => !e.check(wrong))).toHaveLength(2);
  });
});

describe('runAgent(dischargeInstructionsAgent)', () => {
  it('round-trips a valid model response on a BAA model and audits SUCCESS', async () => {
    const { fixture, audit, options } = setup();
    const res = await runAgent(dischargeInstructionsAgent, input, options);

    expect(res.output).toEqual(validOutput);
    expect(res.meta).toMatchObject({
      agent: 'discharge-instructions',
      promptVersion: PROMPT_VERSION,
      tier: 'medium',
      containsPhi: true,
      endpoint: 'anthropic',
      modelId: 'a-med',
    });
    expect(callCount(fixture, 'o-med')).toBe(0); // non-BAA model skipped

    expect(audit.events).toHaveLength(1);
    const [event] = audit.events;
    expect(event).toMatchObject({
      action: 'agent.run',
      actorType: 'agent',
      actorId: 'discharge-instructions',
      agentExecutionId: res.meta.agentExecutionId,
      patientId: 'patient-1',
      surgicalCaseId: 'case-1',
      outcome: 'SUCCESS',
      details: {
        agent: 'discharge-instructions',
        promptVersion: PROMPT_VERSION,
        triggeredByType: 'user',
        triggeredById: 'nurse-1',
        tier: 'medium',
        hostingTarget: 'fixture-direct',
        endpoint: 'anthropic',
        modelId: 'a-med',
        attempts: 1,
      },
    });
    expect(() => sanitizeDetails(event?.details, false)).not.toThrow();
    expect(JSON.stringify(event)).not.toContain('colonoscopy');
  });

  it('throws AgentInputError without calling any model, and audits FAILURE', async () => {
    const { fixture, audit, options } = setup();
    const invalid = { ...input, language: 'fr', firstName: 'CANARY' };
    // @ts-expect-error — deliberately invalid input
    const err: unknown = await runAgent(dischargeInstructionsAgent, invalid, options).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AgentInputError);
    expect((err as AgentInputError).fields).toEqual(['language', 'firstName']);
    expect(String(err)).not.toContain('CANARY');
    expect(Object.keys(fixture.mockModels)).toHaveLength(0);
    expect(audit.events).toMatchObject([{ outcome: 'FAILURE', details: { errorName: 'AgentInputError' } }]);
    expect(() => sanitizeDetails(audit.events[0]?.details, false)).not.toThrow();
  });

  it('audits FAILURE when the model output does not match the schema', async () => {
    const { audit, options } = setup(respondWith('{"summary":"missing everything else"}'));
    await expect(runAgent(dischargeInstructionsAgent, input, options)).rejects.toThrow(/failed after 1 attempt/);
    expect(audit.events).toMatchObject([
      { outcome: 'FAILURE', agentExecutionId: 'exec-1', details: { errorName: 'AgentExecutionError', modelId: 'a-med' } },
    ]);
  });

  it('audits FAILURE for a provider error', async () => {
    const { audit, options } = setup(failWith(apiError(401)));
    await expect(runAgent(dischargeInstructionsAgent, input, options)).rejects.toThrow();
    expect(audit.events[0]).toMatchObject({ outcome: 'FAILURE', details: { attempts: 1, retryable: false } });
  });
});
