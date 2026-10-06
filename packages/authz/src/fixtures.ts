import type { Capability, Grant, Principal, StaffPrincipal, TenantRef } from "@asc/types";

// Test builders. Synthetic ids only.
export const TEST_TENANT: TenantRef = { tenantId: "tenant-1", medplumProjectId: "project-1" };

export function facilityGrant(facilityId: string, roleKeys: string[], capabilities: Capability[]): Grant {
  return { scope: "facility", facilityId, roleKeys, capabilities };
}

export function allGrant(roleKeys: string[], capabilities: Capability[]): Grant {
  return { scope: "all", roleKeys, capabilities };
}

export function staffPrincipal(grants: Grant[], id = "user-1"): StaffPrincipal {
  return { kind: "staff", id, membershipId: `membership-${id}`, tenant: TEST_TENANT, grants };
}

export function patientPrincipal(grants: Grant[], patientId = "patient-1"): Principal {
  return { kind: "patient", id: `portal-${patientId}`, patientId, tenant: TEST_TENANT, grants };
}
