/**
 * Static checks over the agent configuration. Run in tests so a bad config
 * (empty tier, deprecated model still routed, PHI task without a BAA model)
 * fails before it ships.
 */

import { PROVIDER_REGISTRY, type ProviderRegistry } from './providers/index.js';
import { REASONING_TIERS } from './reasoning.js';
import { ROUTING_PROFILES, type RoutingTable } from './routing.js';
import { TASK_PROFILES, type TaskProfiles, type TaskType } from './tasks.js';

export interface AgentConfigInput {
  registry?: ProviderRegistry;
  routingProfiles?: Readonly<Record<string, RoutingTable>>;
  taskProfiles?: TaskProfiles;
}

/** Returns a list of human-readable problems; empty means the config is valid. */
export function validateAgentConfig({
  registry = PROVIDER_REGISTRY,
  routingProfiles = ROUTING_PROFILES,
  taskProfiles = TASK_PROFILES,
}: AgentConfigInput = {}): string[] {
  const problems: string[] = [];

  for (const [profile, table] of Object.entries(routingProfiles)) {
    for (const tier of REASONING_TIERS) {
      const chain = table[tier];
      const where = `routing "${profile}" tier "${tier}"`;

      if (chain.length === 0) problems.push(`${where} is empty`);

      for (const model of chain) {
        if (model.deprecated) problems.push(`${where} routes deprecated model ${model.provider}/${model.key}`);
      }

      const seen = new Set<string>();
      for (const model of chain) {
        const id = `${model.provider}/${model.id}`;
        if (seen.has(id)) problems.push(`${where} lists ${id} twice`);
        seen.add(id);
      }

      const hasBaaModel = chain.some((m) => !m.deprecated && registry[m.provider].baa);
      // A PHI task can run at its minimum tier or any escalated tier above it.
      const phiTasks = (Object.keys(taskProfiles) as TaskType[]).filter(
        (task) =>
          taskProfiles[task].handlesPhi &&
          REASONING_TIERS.indexOf(tier) >= REASONING_TIERS.indexOf(taskProfiles[task].reasoning),
      );
      if (!hasBaaModel && phiTasks.length > 0) {
        problems.push(`${where} has no BAA-covered model but serves PHI tasks: ${phiTasks.join(', ')}`);
      }
    }
  }

  return problems;
}
