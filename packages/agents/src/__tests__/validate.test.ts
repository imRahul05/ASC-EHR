import { describe, expect, it } from 'vitest';

import { AGENTS } from '../agents/registry.js';
import { Capability, REASONING_TIERS, ROUTING_PROFILES, Reasoning, Task } from '../config/index.js';
import { FixtureModels, createCloudFixture, createFixture, defineTestAgent } from '../testing/fixtures.js';
import { validateAgentConfig } from '../validate.js';

describe('validateAgentConfig — production', () => {
  it('config and every registered agent are valid on all routing profiles × hosting targets', () => {
    expect(validateAgentConfig()).toEqual([]);
  });

  it('every routing profile covers every tier', () => {
    for (const table of Object.values(ROUTING_PROFILES)) {
      expect(Object.keys(table).sort()).toEqual([...REASONING_TIERS].sort());
    }
  });

  it('checks the real registry by default', () => {
    expect(Object.keys(AGENTS).length).toBeGreaterThan(0);
  });
});

describe('validateAgentConfig — routing profiles', () => {
  it('reports deprecated, duplicate, unhosted tiers and PHI tiers without a BAA model', () => {
    const { hosting } = createFixture();
    const problems = validateAgentConfig({
      hostingTargets: { fixture: hosting },
      routingProfiles: {
        broken: {
          [Reasoning.High]: [FixtureModels.oHigh, FixtureModels.oHigh],
          [Reasoning.Medium]: [FixtureModels.oMedOld, FixtureModels.aMed],
          [Reasoning.Low]: [],
        },
      },
      agents: {},
    });

    expect(problems).toEqual(
      expect.arrayContaining([
        'routing "broken" tier "low" has no model available on hosting "fixture-direct"',
        'routing "broken" tier "medium" routes deprecated model oMedOld',
        'routing "broken" tier "high" lists oHigh twice',
        expect.stringContaining(
          'routing "broken" tier "high" has no BAA-covered model on hosting "fixture-direct" but serves PHI tasks',
        ),
      ]),
    );
  });

  it('checks each hosting target separately', () => {
    const direct = createFixture();
    const cloud = createCloudFixture();
    const problems = validateAgentConfig({
      hostingTargets: { direct: direct.hosting, cloud: cloud.hosting },
      routingProfiles: { fixture: direct.routing },
      agents: {},
    });
    // Cloud target hosts no low-tier model; direct hosts all of them.
    const availability = problems.filter((p) => p.includes('no model available'));
    expect(availability).toEqual(['routing "fixture" tier "low" has no model available on hosting "fixture-cloud"']);
  });

  it('reports bindings to an unknown endpoint', () => {
    const { hosting } = createFixture();
    const broken = { ...hosting, models: { ...hosting.models, aHigh: { endpoint: 'nope', id: 'x' } } };
    expect(validateAgentConfig({ hostingTargets: { broken }, agents: {} })).toEqual(
      expect.arrayContaining(['hosting "fixture-direct" binds aHigh to unknown endpoint "nope"']),
    );
  });
});

describe('validateAgentConfig — agents', () => {
  const direct = createFixture();
  /** Agent problems only (the fixture routing deliberately lists a deprecated model). */
  const validate = (agents: Record<string, ReturnType<typeof defineTestAgent>>) =>
    validateAgentConfig({
      hostingTargets: { direct: direct.hosting },
      routingProfiles: { fixture: direct.routing },
      agents,
    }).filter((problem) => problem.startsWith('agent '));

  it('accepts an agent that can run on every target', () => {
    expect(validate({ 'test-agent': defineTestAgent() })).toEqual([]);
  });

  it('reports an agent whose required capability no model in its tier has', () => {
    const agent = defineTestAgent({ task: Task.Classification, requires: [Capability.Vision] });
    expect(validate({ 'test-agent': agent })).toEqual([
      expect.stringMatching(/^agent "test-agent" on hosting "fixture-direct" \(routing "fixture"\): No model .* vision/),
    ]);
  });

  it('reports a PHI agent pinned to non-BAA models, once per target (pins ignore profiles)', () => {
    const agent = defineTestAgent({ task: Task.MedicalCoding, models: [FixtureModels.oHigh, FixtureModels.gMed] });
    expect(validate({ 'test-agent': agent })).toEqual([
      expect.stringMatching(/^agent "test-agent" on hosting "fixture-direct" \(routing "\(pinned\)"\): No BAA-covered/),
    ]);
  });

  it('reports pinned deprecated models and registry key mismatches', () => {
    const agent = defineTestAgent({ models: [FixtureModels.oMedOld, FixtureModels.aMed] });
    expect(validate({ 'other-name': agent })).toEqual([
      'agent "test-agent" is registered under "other-name"',
      'agent "test-agent" pins deprecated model oMedOld',
    ]);
  });
});
