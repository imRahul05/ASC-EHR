import type { Capability } from "./capability.js";

// Roles are data (templates), so a role key is a string, not a union (D-A2).
export type RoleKey = string;

export interface TenantRef {
  readonly tenantId: string;
  readonly medplumProjectId: string;
}

// One grant per facility (or one all-site grant). Capabilities are never
// merged across grants: a role held at facility B must not widen facility A.
export type Grant = {
  readonly roleKeys: readonly RoleKey[];
  readonly capabilities: readonly Capability[];
} & (
  | { readonly scope: "all" }
  | { readonly scope: "facility"; readonly facilityId: string }
);

export type PrincipalKind = "staff" | "patient" | "service" | "agent";

interface PrincipalBase {
  readonly id: string;
  readonly tenant: TenantRef;
  readonly grants: readonly Grant[];
}

export interface StaffPrincipal extends PrincipalBase {
  readonly kind: "staff";
  readonly membershipId: string;
}

export interface PatientPrincipal extends PrincipalBase {
  readonly kind: "patient";
  readonly patientId: string;
}

export interface ServicePrincipal extends PrincipalBase {
  readonly kind: "service";
  readonly clientId: string;
}

// An AI run: capabilities = caller's ∩ agent allow-list, data scoped to the run (08 §9).
export interface AgentPrincipal extends PrincipalBase {
  readonly kind: "agent";
  readonly agentId: string;
  readonly executionId: string;
  readonly onBehalfOf: string;
  readonly run: { readonly patientId: string; readonly caseId?: string };
}

export type Principal =
  | StaffPrincipal
  | PatientPrincipal
  | ServicePrincipal
  | AgentPrincipal;

export type RoleTemplateStatus = "active" | "deprecated" | "retired";

// Data rules compile to Medplum AccessPolicy entries (P05c).
export interface ResourceRule {
  readonly resourceType: string;
  readonly readonly?: boolean;
  readonly hiddenFields?: readonly string[];
  readonly readonlyFields?: readonly string[];
  readonly lockWhenFinal?: boolean;
}

export interface RoleTemplate {
  readonly key: RoleKey;
  readonly version: number;
  readonly label: string;
  readonly status: RoleTemplateStatus;
  readonly capabilities: readonly Capability[];
  readonly data: readonly ResourceRule[];
  readonly facilityScoped: boolean;
  readonly requiresMfa: boolean;
}
