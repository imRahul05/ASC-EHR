import type { AgentPrincipal, Capability, StaffPrincipal } from "@asc/types";

export interface AgentRun {
  readonly agentId: string;
  readonly executionId: string;
  readonly allowList: readonly Capability[];
  readonly patientId: string;
  readonly caseId?: string;
}

// An agent never holds more than the user who started it: per grant,
// capabilities = caller's ∩ agent allow-list. Facility scope is kept per
// grant; the run scope (patient/case) is enforced by can().
export function deriveAgentPrincipal(caller: StaffPrincipal, run: AgentRun): AgentPrincipal {
  const allowed = new Set<Capability>(run.allowList);
  const grants = caller.grants
    .map((grant) => ({ ...grant, capabilities: grant.capabilities.filter((c) => allowed.has(c)) }))
    .filter((grant) => grant.capabilities.length > 0);

  return {
    kind: "agent",
    id: `agent:${run.agentId}:${run.executionId}`,
    tenant: caller.tenant,
    agentId: run.agentId,
    executionId: run.executionId,
    onBehalfOf: caller.id,
    run: run.caseId === undefined ? { patientId: run.patientId } : { patientId: run.patientId, caseId: run.caseId },
    grants,
  };
}
