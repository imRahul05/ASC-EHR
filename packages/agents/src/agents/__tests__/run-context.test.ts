import { sanitizeDetails } from '@asc/audit';
import { describe, expect, it } from 'vitest';

import { ContextScopeError, StaleContextError, computeContentHash, type RunContext } from '../../context/index.js';
import { buildContextManifest } from '../../context/manifest.js';
import { Task } from '../../config/index.js';
import {
  callCount,
  contextItem,
  createAuditRecorder,
  createFixture,
  createTestGateway,
  defineTestAgent,
  respondWith,
} from '../../testing/fixtures.js';
import { InMemoryAgentRunStore } from '../../testing/run-store.js';
import { runAgent, type RunAgentOptions } from '../run.js';

const input = { topic: 'synthetic' };
const answer = respondWith('{"answer":"ok"}');

/** Non-PHI medium tier: `o-med` (no BAA) first, then the BAA model `a-med`. */
function setup() {
  const fixture = createFixture({ 'o-med': answer, 'a-med': answer });
  const audit = createAuditRecorder();
  const options: RunAgentOptions = {
    actor: { type: 'user', id: 'user-1' },
    containsPhi: false,
    patientId: 'patient-1',
    surgicalCaseId: 'case-1',
    gateway: createTestGateway(fixture),
    audit,
  };
  return { fixture, audit, options };
}

function withContext(items: RunContext['items']): RunContext {
  return { scope: { orgId: 'org-1', patientId: 'patient-1', caseId: 'case-1' }, items };
}

function modelCalls(fixture: ReturnType<typeof createFixture>): number {
  return Object.values(fixture.mockModels).reduce((n, m) => n + m.doGenerateCalls.length, 0);
}

describe('runAgent — context', () => {
  it('passes the context to buildMessages and audits only its size and manifest hash', async () => {
    const { audit, options } = setup();
    const context = withContext([contextItem()]);
    let received: RunContext | undefined;
    const agent = defineTestAgent({
      buildMessages: ({ topic }, ctx) => {
        received = ctx;
        return [{ role: 'user', content: topic }];
      },
    });
    await runAgent(agent, input, { ...options, containsPhi: true, context });

    expect(received).toBe(context);
    const [event] = audit.events;
    expect(event?.details).toMatchObject({
      contextItems: 1,
      contextManifestHash: await computeContentHash(buildContextManifest(context.items)),
    });
    expect(() => sanitizeDetails(event?.details, false)).not.toThrow();
    expect(JSON.stringify(audit.events)).not.toMatch(/CANARY|labs\.inr|Observation/);
  });

  it('rejects an item of another patient before any model call (failureKind "context")', async () => {
    const { fixture, audit, options } = setup();
    const foreign = contextItem({ key: 'labs.inr', scope: { orgId: 'org-1', patientId: 'patient-2' } });

    await expect(
      runAgent(defineTestAgent(), input, { ...options, context: withContext([foreign]) }),
    ).rejects.toBeInstanceOf(ContextScopeError);
    expect(modelCalls(fixture)).toBe(0);
    expect(audit.events).toMatchObject([
      { outcome: 'FAILURE', details: { errorName: 'ContextScopeError', failureKind: 'context', attempts: 0 } },
    ]);
    expect(() => sanitizeDetails(audit.events[0]?.details, false)).not.toThrow();
  });

  it('rejects a context scope that disagrees with the run ids', async () => {
    const { fixture, options } = setup();
    const context: RunContext = { scope: { orgId: 'org-1', patientId: 'patient-2' }, items: [] };

    const err: unknown = await runAgent(defineTestAgent(), input, { ...options, context }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ContextScopeError);
    expect((err as ContextScopeError).mismatches.map((m) => m.field)).toEqual(['patientId', 'caseId']);
    expect(modelCalls(fixture)).toBe(0);
  });

  it('rejects stale context listing keys only — no values in the error or the audit', async () => {
    const { fixture, audit, options } = setup();
    const stale = contextItem({ key: 'labs.inr', effectiveAt: '2020-01-01T00:00:00.000Z', maxAgeMs: 60_000 });

    const err: unknown = await runAgent(defineTestAgent(), input, {
      ...options,
      context: withContext([stale, contextItem({ key: 'meds.plan' })]),
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(StaleContextError);
    expect((err as StaleContextError).keys).toEqual(['labs.inr']);
    expect(String(err)).not.toContain('CANARY');
    expect(modelCalls(fixture)).toBe(0);
    expect(audit.events).toMatchObject([
      { outcome: 'FAILURE', details: { errorName: 'StaleContextError', failureKind: 'context', contextItems: 2 } },
    ]);
    expect(JSON.stringify(audit.events)).not.toMatch(/CANARY|labs\.inr/);
  });

  it('a context failure marks the claimed run failed', async () => {
    const { options } = setup();
    const runStore = new InMemoryAgentRunStore();
    const stale = contextItem({ validUntil: '2020-01-01T00:00:00.000Z' });

    await expect(
      runAgent(defineTestAgent(), input, { ...options, runStore, executionId: 'job-1', context: withContext([stale]) }),
    ).rejects.toBeInstanceOf(StaleContextError);
    expect(await runStore.get('job-1')).toMatchObject({ status: 'failed', failureKind: 'context' });
  });
});

describe('runAgent — containsPhi derived from context', () => {
  it('containsPhi false + a PHI item → routed as PHI (BAA-only)', async () => {
    const { fixture, audit, options } = setup();
    const res = await runAgent(defineTestAgent(), input, {
      ...options,
      containsPhi: false,
      context: withContext([contextItem({ sensitivity: 'phi' })]),
    });

    expect(res.meta).toMatchObject({ containsPhi: true, modelId: 'a-med', endpoint: 'anthropic' });
    expect(callCount(fixture, 'o-med')).toBe(0); // non-BAA model skipped
    expect(audit.events[0]?.details).toMatchObject({ containsPhi: true });
  });

  it('containsPhi true + no PHI item stays true (never downgraded)', async () => {
    const { fixture, options } = setup();
    const res = await runAgent(defineTestAgent(), input, {
      ...options,
      containsPhi: true,
      context: withContext([contextItem({ sensitivity: 'none' })]),
    });

    expect(res.meta).toMatchObject({ containsPhi: true, modelId: 'a-med' });
    expect(callCount(fixture, 'o-med')).toBe(0);
  });

  it('containsPhi false + no PHI item stays false', async () => {
    const { options } = setup();
    const res = await runAgent(defineTestAgent(), input, {
      ...options,
      context: withContext([contextItem({ sensitivity: 'none' })]),
    });
    expect(res.meta).toMatchObject({ containsPhi: false, modelId: 'o-med' });
  });

  it('the PHI task policy still wins without any context', async () => {
    const { options } = setup();
    const res = await runAgent(defineTestAgent({ task: Task.PatientInstructions }), input, options);
    expect(res.meta).toMatchObject({ containsPhi: true, modelId: 'a-med' });
  });
});

describe('runAgent — context manifest on the run record', () => {
  it('stores metadata for every item and no values', async () => {
    const { options } = setup();
    const runStore = new InMemoryAgentRunStore();
    const items = [contextItem(), contextItem({ key: 'org.contact', scope: { orgId: 'org-1' }, sensitivity: 'none' })];
    await runAgent(defineTestAgent(), input, { ...options, runStore, executionId: 'job-1', context: withContext(items) });

    const stored = await runStore.get('job-1');
    expect(stored).toMatchObject({ orgId: 'org-1', containsPhi: true });
    expect(stored?.contextManifest?.map((e) => e.key)).toEqual(['labs.inr', 'org.contact']);
    expect(stored?.contextManifest?.[0]).toMatchObject({
      source: { system: 'fhir', resourceType: 'Observation', id: 'obs-1', version: '3' },
      authority: 'record',
      contentHash: 'sha256:fixture',
    });
    expect(stored?.contextManifest?.every((e) => !('value' in e))).toBe(true);
    expect(JSON.stringify(stored?.contextManifest)).not.toContain('CANARY');
  });
});
