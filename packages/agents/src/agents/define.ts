/**
 * What an agent IS: one typed definition bundling its routing policy (task,
 * reasoning, model pin, required capabilities), its prompt (versioned
 * instructions + message builder) and its input / output schemas.
 *
 * `runAgent()` executes a definition; `AGENTS` (registry.ts) lists them all.
 */

import type { ModelMessage, ToolSet } from 'ai';
import type { z } from 'zod';

import {
  Capability,
  type ModelCapability,
  type ModelRef,
  type ReasoningTier,
  type TaskType,
} from '../config/index.js';
import type { RunContext } from '../context/types.js';

export interface AgentDefinition<
  Name extends string = string,
  Input extends z.ZodTypeAny = z.ZodTypeAny,
  Output extends z.ZodTypeAny = z.ZodTypeAny,
> {
  /** Kebab-case id, e.g. `discharge-instructions`. Written to audit events. */
  name: Name;
  description: string;
  /** Sets the minimum tier and PHI policy (`TASK_PROFILES`). */
  task: TaskType;
  /** Escalates above the task's minimum tier; never lowers it. */
  reasoning?: ReasoningTier;
  /** Pinned models in fallback order; replace the tier's routing chain. */
  models?: readonly ModelRef[];
  /** Capabilities beyond structured output (always required) and tools (required when `tools` is set). */
  requires?: readonly ModelCapability[];
  /** Bump whenever `instructions` or `buildMessages` change, e.g. `2026-09-25.1`. */
  promptVersion: string;
  input: Input;
  output: Output;
  instructions: string;
  /**
   * Where the agent decides what input and context reach the model (tool
   * results are the other governed path). Build messages from individual
   * typed fields (minimum necessary PHI); never serialize the whole input
   * object or a context value. Render `trust: 'untrusted-text'` items only
   * through `wrapUntrustedText`.
   *
   * `context` is the run's context when the caller passed one; agents that
   * need none just omit the parameter.
   *
   * Method syntax on purpose: its bivariant parameter lets every definition
   * be assigned to `AnyAgentDefinition`.
   */
  buildMessages(input: z.output<Input>, context?: RunContext): ModelMessage[];
  tools?: ToolSet;
  /** Tool-loop step limit; only meaningful with `tools`. */
  maxSteps?: number;
}

/** Any agent definition, e.g. for registries and validation. */
export type AnyAgentDefinition = AgentDefinition<string, z.ZodTypeAny, z.ZodTypeAny>;

/** A synthetic eval case: input plus named checks on the agent's output. */
export interface AgentEvalCase<Input, Output> {
  name: string;
  input: Input;
  expectations: readonly { description: string; check: (output: Output) => boolean }[];
}

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROMPT_VERSION = /^\d{4}-\d{2}-\d{2}\.\d+$/;

export function defineAgent<const Name extends string, Input extends z.ZodTypeAny, Output extends z.ZodTypeAny>(
  definition: AgentDefinition<Name, Input, Output>,
): AgentDefinition<Name, Input, Output> {
  if (!KEBAB_CASE.test(definition.name)) {
    throw new Error(`Agent name "${definition.name}" must be kebab-case.`);
  }
  if (!PROMPT_VERSION.test(definition.promptVersion)) {
    throw new Error(`Agent "${definition.name}" promptVersion must look like YYYY-MM-DD.N.`);
  }
  return definition;
}

/** Everything a model must support to run this agent. */
export function requiredCapabilities(definition: AnyAgentDefinition): ModelCapability[] {
  const required = new Set<ModelCapability>(definition.requires);
  required.add(Capability.StructuredOutput);
  if (definition.tools) required.add(Capability.Tools);
  return [...required];
}
