/**
 * Static checks over the agent configuration. Run in tests so a bad config
 * fails before it ships:
 *   - deprecated models still routed, duplicates in a chain
 *   - bindings pointing at an endpoint the target does not define
 *   - a tier with no model available on a hosting target
 *   - a PHI-capable tier with no BAA-covered model on a hosting target
 */

import { HOSTING_TARGETS, type HostingTarget } from './hosting/index.js';
import { REASONING_TIERS } from './reasoning.js';
import { ROUTING_PROFILES, type RoutingTable } from './routing.js';
import { TASK_PROFILES, type TaskProfiles, type TaskType } from './tasks.js';

export interface AgentConfigInput {
  hostingTargets?: Readonly<Record<string, HostingTarget>>;
  routingProfiles?: Readonly<Record<string, RoutingTable>>;
  taskProfiles?: TaskProfiles;
}

/** Returns human-readable problems; empty means the config is valid. */
export function validateAgentConfig({
  hostingTargets = HOSTING_TARGETS,
  routingProfiles = ROUTING_PROFILES,
  taskProfiles = TASK_PROFILES,
}: AgentConfigInput = {}): string[] {
  const problems: string[] = [];
  const tasks = Object.keys(taskProfiles) as TaskType[];

  for (const target of Object.values(hostingTargets)) {
    for (const [modelName, binding] of Object.entries(target.models)) {
      if (binding && !(binding.endpoint in target.endpoints)) {
        problems.push(`hosting "${target.name}" binds ${modelName} to unknown endpoint "${binding.endpoint}"`);
      }
    }
  }

  for (const [profile, table] of Object.entries(routingProfiles)) {
    for (const tier of REASONING_TIERS) {
      const where = `routing "${profile}" tier "${tier}"`;
      const chain = table[tier];

      const seen = new Set<string>();
      for (const model of chain) {
        if (model.deprecated) problems.push(`${where} routes deprecated model ${model.name}`);
        if (seen.has(model.name)) problems.push(`${where} lists ${model.name} twice`);
        seen.add(model.name);
      }

      // A PHI task can run at its minimum tier or any escalated tier above it.
      const phiTasks = tasks.filter(
        (task) =>
          taskProfiles[task].handlesPhi &&
          REASONING_TIERS.indexOf(tier) >= REASONING_TIERS.indexOf(taskProfiles[task].reasoning),
      );

      for (const target of Object.values(hostingTargets)) {
        const available = chain.filter((m) => !m.deprecated && target.models[m.name] !== undefined);
        if (available.length === 0) {
          problems.push(`${where} has no model available on hosting "${target.name}"`);
          continue;
        }
        const hasBaa = available.some((m) => {
          const binding = target.models[m.name];
          return binding !== undefined && target.endpoints[binding.endpoint]?.baa === true;
        });
        if (!hasBaa && phiTasks.length > 0) {
          problems.push(
            `${where} has no BAA-covered model on hosting "${target.name}" but serves PHI tasks: ${phiTasks.join(', ')}`,
          );
        }
      }
    }
  }

  return problems;
}
