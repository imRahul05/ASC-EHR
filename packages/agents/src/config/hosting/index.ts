/**
 * Hosting target registry. Adding a target (Azure, AWS Bedrock, …) = one new
 * file in this folder + one line here. See packages/agents/README.md.
 */

import type { HostingTarget } from './define.js';
import { directHosting } from './direct.js';

export * from './define.js';
export { directHosting } from './direct.js';

export const HOSTING_TARGETS = {
  direct: directHosting,
} as const satisfies Record<string, HostingTarget>;

export type HostingTargetName = keyof typeof HOSTING_TARGETS;

export const DEFAULT_HOSTING_TARGET: HostingTarget = HOSTING_TARGETS.direct;
