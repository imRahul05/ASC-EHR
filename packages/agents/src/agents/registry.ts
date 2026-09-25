/**
 * Every agent in the system. Adding an agent = a new folder under `agents/`
 * plus one line here; `validateAgentConfig()` then checks it can run on every
 * hosting target and routing profile.
 */

import type { AnyAgentDefinition } from './define.js';
import { dischargeInstructionsAgent } from './discharge-instructions/index.js';

export const AGENTS = {
  [dischargeInstructionsAgent.name]: dischargeInstructionsAgent,
} as const satisfies Record<string, AnyAgentDefinition>;

export type AgentName = keyof typeof AGENTS;
