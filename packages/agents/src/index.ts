/**
 * Public API of @asc/agents. Internals (fixtures, eval cases, router
 * building blocks) are intentionally not exported.
 */

// Config: models, providers, hosting, tiers, tasks, routing (curated barrel).
export * from './config/index.js';

// Runtime: gateway, router, errors.
export {
  createGateway,
  defaultGateway,
  executeAgentObject,
  executeAgentTask,
  streamAgentTask,
  type AgentCallParams,
  type AgentExecutionMeta,
  type AgentObjectResult,
  type AgentStreamResult,
  type AgentStreamTaskResult,
  type AgentTaskResult,
  type AgentTextResult,
  type AgentTokenUsage,
  type ExecuteAgentObjectParams,
  type ExecuteAgentParams,
  type Gateway,
  type GatewayOptions,
  type GatewayTelemetryOptions,
  type StreamAgentParams,
} from './runtime/gateway.js';
export {
  getFallbackChain,
  getModelForTask,
  getRoutingInfo,
  getRoutingOverview,
  resolveContainsPhi,
  resolveEffectiveTier,
  type FallbackChainOptions,
  type ModelSelection,
  type ResolvedModel,
  type RoutingContext,
  type RoutingInfoEntry,
} from './runtime/router.js';
export {
  AgentExecutionError,
  ModelRefusalError,
  NoAvailableModelError,
  NoCapableModelError,
  NoCompliantModelError,
  classifyModelError,
  isRefusalError,
  isRetryableModelError,
  type AgentFailureKind,
} from './runtime/errors.js';

// Agents: definition, execution, registry.
export {
  defineAgent,
  type AgentDefinition,
  type AgentEvalCase,
  type AnyAgentDefinition,
} from './agents/define.js';
export {
  AGENT_RUN_ACTION,
  AGENT_RUN_REPLAY_ACTION,
  AgentInputError,
  runAgent,
  type AgentActor,
  type AgentAuditSink,
  type AgentRunMeta,
  type AgentRunResult,
  type RunAgentOptions,
} from './agents/run.js';

// Execution state: run records for idempotent retries (interface; the PHI store lives in apps).
export {
  AgentRunConflictError,
  AgentRunInProgressError,
  DEFAULT_STALE_RUN_AFTER_MS,
  isSameRunOwner,
  type AgentRunBeginResult,
  type AgentRunRecord,
  type AgentRunStart,
  type AgentRunStatus,
  type AgentRunStore,
} from './state/run-store.js';

// Context: typed, provenance-carrying items, providers (implemented in apps), checks, manifest.
export * from './context/index.js';
export { AGENTS, type AgentName } from './agents/registry.js';
export {
  dischargeInstructionsAgent,
  dischargeInstructionsInputSchema,
  type DischargeInstructionsInput,
} from './agents/discharge-instructions/index.js';

export { validateAgentConfig, type AgentConfigInput } from './validate.js';
