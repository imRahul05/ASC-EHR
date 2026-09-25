/**
 * Static checks over the whole agent setup — config AND registered agents.
 * Run in tests so a bad config fails before it ships:
 *   - deprecated models still routed or pinned, duplicates in a chain
 *   - bindings pointing at an endpoint the target does not define
 *   - a tier with no model available on a hosting target
 *   - a PHI-capable tier with no BAA-covered model on a hosting target
 *   - an agent that cannot run on some hosting target × routing profile
 *     (no hosted model, none with its required capabilities, or no BAA model for PHI)
 *
 * Lives outside `config/` because it also reads the agent registry, which
 * itself depends on `config/`.
 */

import { AGENTS } from './agents/registry.js';
import { requiredCapabilities, type AnyAgentDefinition } from './agents/define.js';
import {
  HOSTING_TARGETS_FOR_VALIDATION,
  REASONING_TIERS,
  ROUTING_PROFILES,
  TASK_PROFILES,
  type HostingTarget,
  type RoutingTable,
  type TaskProfiles,
  type TaskType,
} from './config/index.js';
import { resolveEffectiveTier, selectEligibleModels } from './runtime/router.js';

export interface AgentConfigInput {
  hostingTargets?: Readonly<Record<string, HostingTarget>>;
  routingProfiles?: Readonly<Record<string, RoutingTable>>;
  taskProfiles?: TaskProfiles;
  agents?: Readonly<Record<string, AnyAgentDefinition>>;
}

/** Returns human-readable problems; empty means the config is valid. */
export function validateAgentConfig({
  hostingTargets = HOSTING_TARGETS_FOR_VALIDATION,
  routingProfiles = ROUTING_PROFILES,
  taskProfiles = TASK_PROFILES,
  agents = AGENTS,
}: AgentConfigInput = {}): string[] {
  return [
    ...checkBindings(hostingTargets),
    ...checkRoutingProfiles(hostingTargets, routingProfiles, taskProfiles),
    ...checkAgents(hostingTargets, routingProfiles, taskProfiles, agents),
  ];
}

function checkBindings(hostingTargets: Readonly<Record<string, HostingTarget>>): string[] {
  const problems: string[] = [];
  for (const target of Object.values(hostingTargets)) {
    for (const [modelName, binding] of Object.entries(target.models)) {
      if (binding && !(binding.endpoint in target.endpoints)) {
        problems.push(`hosting "${target.name}" binds ${modelName} to unknown endpoint "${binding.endpoint}"`);
      }
    }
  }
  return problems;
}

function checkRoutingProfiles(
  hostingTargets: Readonly<Record<string, HostingTarget>>,
  routingProfiles: Readonly<Record<string, RoutingTable>>,
  taskProfiles: TaskProfiles,
): string[] {
  const problems: string[] = [];
  const tasks = Object.keys(taskProfiles) as TaskType[];

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

/** Runs each agent's routing (pin or tier chain → hosting → capabilities → BAA) on every target × profile. */
function checkAgents(
  hostingTargets: Readonly<Record<string, HostingTarget>>,
  routingProfiles: Readonly<Record<string, RoutingTable>>,
  taskProfiles: TaskProfiles,
  agents: Readonly<Record<string, AnyAgentDefinition>>,
): string[] {
  const problems: string[] = [];

  for (const [key, agent] of Object.entries(agents)) {
    if (key !== agent.name) problems.push(`agent "${agent.name}" is registered under "${key}"`);
    for (const model of agent.models ?? []) {
      if (model.deprecated) problems.push(`agent "${agent.name}" pins deprecated model ${model.name}`);
    }

    const tier = resolveEffectiveTier(agent.task, agent.reasoning, taskProfiles);
    const options = {
      containsPhi: taskProfiles[agent.task].handlesPhi,
      models: agent.models,
      requires: requiredCapabilities(agent),
      taskProfiles,
    };

    // A pin ignores routing profiles, so one check per target is enough.
    const tables: [string, RoutingTable | undefined][] = agent.models
      ? [['(pinned)', undefined]]
      : Object.entries(routingProfiles);

    for (const hosting of Object.values(hostingTargets)) {
      for (const [profile, routing] of tables) {
        try {
          selectEligibleModels(tier, { ...options, hosting, routing });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          problems.push(`agent "${agent.name}" on hosting "${hosting.name}" (routing "${profile}"): ${reason}`);
        }
      }
    }
  }
  return problems;
}
