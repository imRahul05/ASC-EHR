/**
 * Runs an agent definition: validate input → build messages → gateway
 * (structured output, validated against the output schema) → audit.
 *
 * Every run writes exactly one audit event, on success AND failure. Audit
 * details carry routing metadata only — never input values, prompts or output.
 */

import { getAuditClient, type AuditClient, type AuditDetails } from '@asc/audit';
import type { z } from 'zod';

import {
  AgentExecutionError,
  NoAvailableModelError,
  NoCapableModelError,
  NoCompliantModelError,
} from '../runtime/errors.js';
import {
  defaultGateway,
  type AgentExecutionMeta,
  type AgentObjectResult,
  type Gateway,
} from '../runtime/gateway.js';
import { requiredCapabilities, type AgentDefinition } from './define.js';

/** Who triggered the run. The agent itself is recorded as the audit actor. */
export interface AgentActor {
  type: 'user' | 'system';
  id: string;
}

/** Where audit events go. `@asc/audit`'s client satisfies this. */
export type AgentAuditSink = Pick<AuditClient, 'logEvent'>;

export interface RunAgentOptions {
  actor: AgentActor;
  /**
   * REQUIRED, as for the gateway: does the input contain PHI? Agents whose
   * task handles PHI are always routed as PHI regardless.
   */
  containsPhi: boolean;
  /** Internal ids for the audit trail (never names or MRNs). */
  patientId?: string;
  surgicalCaseId?: string;
  /** The app's configured gateway (hosting target, routing profile). Defaults to `defaultGateway`. */
  gateway?: Gateway;
  /** Defaults to `getAuditClient()` — which fails closed in production without a durable store. */
  audit?: AgentAuditSink;
  abortSignal?: AbortSignal;
}

export interface AgentRunMeta extends AgentExecutionMeta {
  agent: string;
  promptVersion: string;
}

export interface AgentRunResult<Output> {
  output: Output;
  meta: AgentRunMeta;
}

/** Input failed the agent's schema. Lists field paths only — never the offending values. */
export class AgentInputError extends Error {
  override readonly name = 'AgentInputError';
  readonly agent: string;
  readonly fields: readonly string[];

  constructor(agent: string, fields: readonly string[]) {
    super(`Invalid input for agent "${agent}": ${fields.join(', ')}.`);
    this.agent = agent;
    this.fields = fields;
  }
}

export const AGENT_RUN_ACTION = 'agent.run';

export async function runAgent<Name extends string, Input extends z.ZodTypeAny, Output extends z.ZodTypeAny>(
  definition: AgentDefinition<Name, Input, Output>,
  input: z.input<Input>,
  options: RunAgentOptions,
): Promise<AgentRunResult<z.output<Output>>> {
  // Resolved first so a missing audit store fails before any model is called.
  const audit = options.audit ?? getAuditClient();
  const gateway = options.gateway ?? defaultGateway;
  const record = (outcome: 'SUCCESS' | 'FAILURE', agentExecutionId: string | undefined, details: AuditDetails) =>
    audit.logEvent({
      action: AGENT_RUN_ACTION,
      actorType: 'agent',
      actorId: definition.name,
      agentExecutionId,
      patientId: options.patientId,
      surgicalCaseId: options.surgicalCaseId,
      outcome,
      details: {
        agent: definition.name,
        promptVersion: definition.promptVersion,
        triggeredByType: options.actor.type,
        triggeredById: options.actor.id,
        ...details,
      },
    });

  let result: AgentObjectResult<z.output<Output>>;
  try {
    const parsed = definition.input.safeParse(input);
    if (!parsed.success) throw new AgentInputError(definition.name, fieldPaths(parsed.error));
    // zod 3 types safeParse on a generic schema as `any`; the data was parsed by `Input`.
    const validInput = parsed.data as z.output<Input>;

    result = await gateway.executeAgentObject<z.output<Output>>({
      task: definition.task,
      reasoning: definition.reasoning,
      models: definition.models,
      requires: requiredCapabilities(definition),
      containsPhi: options.containsPhi,
      instructions: definition.instructions,
      messages: definition.buildMessages(validInput),
      schema: definition.output,
      tools: definition.tools,
      maxSteps: definition.maxSteps,
      abortSignal: options.abortSignal,
    });
  } catch (error) {
    // If the audit write itself fails, that error propagates instead: audit loss must be loud.
    await record('FAILURE', executionIdOf(error), failureDetails(error));
    throw error;
  }

  const { output, ...execution } = result;
  await record('SUCCESS', execution.agentExecutionId, {
    task: execution.task,
    tier: execution.tier,
    containsPhi: execution.containsPhi,
    hostingTarget: execution.hostingTarget,
    endpoint: execution.endpoint,
    modelName: execution.modelName,
    modelId: execution.modelId,
    attempts: execution.attempts,
  });
  return { output, meta: { ...execution, agent: definition.name, promptVersion: definition.promptVersion } };
}

function fieldPaths(error: z.ZodError): string[] {
  const paths = error.issues.flatMap((issue) =>
    issue.code === 'unrecognized_keys'
      ? issue.keys.map((key) => [...issue.path, key].join('.'))
      : [issue.path.join('.') || '(root)'],
  );
  return [...new Set(paths)];
}

function executionIdOf(error: unknown): string | undefined {
  return error instanceof AgentExecutionError ? error.agentExecutionId : undefined;
}

/** PHI-free failure metadata: error name plus whatever routing facts the error carries. */
function failureDetails(error: unknown): AuditDetails {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  if (error instanceof AgentExecutionError) {
    return {
      errorName,
      tier: error.tier,
      hostingTarget: error.hostingTarget,
      endpoint: error.lastEndpoint,
      modelId: error.lastModelId,
      attempts: error.attempts,
      retryable: error.retryable,
    };
  }
  if (
    error instanceof NoCompliantModelError ||
    error instanceof NoCapableModelError ||
    error instanceof NoAvailableModelError
  ) {
    return { errorName, tier: error.tier, hostingTarget: error.hostingTarget, attempts: 0 };
  }
  return { errorName, attempts: 0 };
}
