import { describe, expect, it } from 'vitest';

import { Capability } from '../../config/index.js';
import { defineTestAgent } from '../../testing/fixtures.js';
import { requiredCapabilities } from '../define.js';
import { AGENTS } from '../registry.js';

describe('defineAgent', () => {
  it('rejects a non-kebab-case name', () => {
    expect(() => defineTestAgent({ name: 'DischargeInstructions' })).toThrow(/kebab-case/);
  });

  it('rejects a promptVersion that is not YYYY-MM-DD.N', () => {
    expect(() => defineTestAgent({ promptVersion: 'v1' })).toThrow(/promptVersion/);
  });
});

describe('requiredCapabilities', () => {
  it('always includes structured output, adds tools only when the agent has tools', () => {
    expect(requiredCapabilities(defineTestAgent())).toEqual([Capability.StructuredOutput]);
    expect(requiredCapabilities(defineTestAgent({ requires: [Capability.Vision], tools: {} }))).toEqual([
      Capability.Vision,
      Capability.StructuredOutput,
      Capability.Tools,
    ]);
  });
});

describe('AGENTS registry', () => {
  it('is keyed by each agent name', () => {
    for (const [key, agent] of Object.entries(AGENTS)) expect(agent.name).toBe(key);
  });
});
