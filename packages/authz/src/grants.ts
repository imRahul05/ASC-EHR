import type { Capability, Grant, RoleKey } from "@asc/types";
import type { RoleRegistry } from "./roles/registry.js";

// One role held by a user, optionally at one facility.
export interface RoleAssignment {
  readonly roleKey: RoleKey;
  readonly facilityId?: string;
}

interface Bucket {
  readonly roleKeys: Set<RoleKey>;
  readonly capabilities: Set<Capability>;
}

function bucketFor(buckets: Map<string, Bucket>, id: string): Bucket {
  const existing = buckets.get(id);
  if (existing !== undefined) return existing;
  const created: Bucket = { roleKeys: new Set(), capabilities: new Set() };
  buckets.set(id, created);
  return created;
}

// Builds per-facility grants. Capabilities are unioned only within one
// facility (or the all-site grant), never across facilities. Fail closed:
// unknown or retired roles and facility-scoped roles without a facility
// produce no grant.
export function buildGrants(assignments: readonly RoleAssignment[], registry: RoleRegistry): Grant[] {
  const all: Bucket = { roleKeys: new Set(), capabilities: new Set() };
  const byFacility = new Map<string, Bucket>();

  for (const { roleKey, facilityId } of assignments) {
    const template = registry.get(roleKey);
    if (template === undefined || template.status === "retired") continue;

    let bucket = all;
    if (template.facilityScoped) {
      if (facilityId === undefined || facilityId.length === 0) continue;
      bucket = bucketFor(byFacility, facilityId);
    }
    bucket.roleKeys.add(roleKey);
    for (const capability of template.capabilities) bucket.capabilities.add(capability);
  }

  const grants: Grant[] = [];
  if (all.roleKeys.size > 0) {
    grants.push({ scope: "all", roleKeys: [...all.roleKeys], capabilities: [...all.capabilities] });
  }
  for (const [facilityId, bucket] of byFacility) {
    grants.push({
      scope: "facility",
      facilityId,
      roleKeys: [...bucket.roleKeys],
      capabilities: [...bucket.capabilities],
    });
  }
  return grants;
}
