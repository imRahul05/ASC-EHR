import type { Capability, Grant, RoleKey } from "@asc/types";
import type { RoleRegistry } from "./roles/registry.js";

export const ROLE_TEMPLATE_CODE_SYSTEM = "https://asc-ehr.app/role-template";

// One role held by a user, optionally at one facility.
export interface RoleAssignment {
  readonly roleKey: RoleKey;
  readonly facilityId?: string;
}

/** Minimal structural shape of a FHIR PractitionerRole needed to extract role assignments. */
export interface PractitionerRoleLike {
  readonly active?: boolean;
  readonly code?: readonly {
    readonly coding?: readonly {
      readonly system?: string;
      readonly code?: string;
    }[];
  }[];
  readonly organization?: {
    readonly reference?: string;
  };
}

/**
 * Extracts role assignments from a user's active PractitionerRole resources.
 * Only roles with `active === true` and a coding matching `ROLE_TEMPLATE_CODE_SYSTEM`
 * are mapped. Organization reference "Organization/<id>" is parsed into facilityId.
 */
export function practitionerRolesToAssignments(
  roles: readonly PractitionerRoleLike[],
  codeSystem: string = ROLE_TEMPLATE_CODE_SYSTEM,
): RoleAssignment[] {
  const assignments: RoleAssignment[] = [];
  for (const role of roles) {
    if (role.active !== true) continue;
    const matchingCodings = role.code
      ?.flatMap((c) => c.coding ?? [])
      .filter((coding) => coding.system === codeSystem && typeof coding.code === "string" && coding.code.length > 0) ?? [];
    if (matchingCodings.length === 0) continue;

    const orgRef = role.organization?.reference;
    const facilityId = orgRef
      ? orgRef.startsWith("Organization/")
        ? orgRef.slice("Organization/".length)
        : orgRef
      : undefined;

    for (const coding of matchingCodings) {
      if (coding.code === undefined) continue;
      assignments.push({
        roleKey: coding.code,
        ...(facilityId !== undefined && facilityId.length > 0 ? { facilityId } : {}),
      });
    }
  }
  return assignments;
}

/**
 * Maps a list of PractitionerRole resources (read with the user's token)
 * to per-facility grants using the provided role registry.
 */
export function grantsFromPractitionerRoles(
  roles: readonly PractitionerRoleLike[],
  registry: RoleRegistry,
  codeSystem: string = ROLE_TEMPLATE_CODE_SYSTEM,
): Grant[] {
  const assignments = practitionerRolesToAssignments(roles, codeSystem);
  return buildGrants(assignments, registry);
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
