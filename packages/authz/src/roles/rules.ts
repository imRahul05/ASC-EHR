import type { ResourceRule } from "@asc/types";

// Data-rule shorthands for role templates (08 §7.4). A resource type that is
// not listed is not accessible, so "hidden" is expressed by omission.
export const rw = (resourceType: string): ResourceRule => ({ resourceType });

export const ro = (resourceType: string): ResourceRule => ({ resourceType, readonly: true });

// Directory data every staff role needs to render names, places and teams.
// It is tenant-wide and carries no facility tag, so it is `shared`: the
// compiler must not add the facility filter, or nurses would see no doctors.
const REFERENCE_TYPES = ["Practitioner", "PractitionerRole", "Organization", "Location"];

export const REFERENCE_READ: readonly ResourceRule[] = REFERENCE_TYPES.map((type) => ({ ...ro(type), shared: true }));

// Administrators maintain the directory (admin.users, admin.facility), except `PractitionerRole`: those records
// are role grants (code system `ROLE_TEMPLATE_TAG_SYSTEM`) that the API builds a user's capabilities from, so
// a role that could write them could grant itself any role at any facility. Grants are written only by the
// seed and the provisioner, with ops credentials (ADR 2026-10-08, review amendments).
// TODO(P06 provisioner): renaming or repurposing a facility `Organization` moves every resource tagged with it
// (`meta.accounts`); make it an audited admin action with a reason, not a plain directory edit.
export const REFERENCE_WRITE: readonly ResourceRule[] = REFERENCE_TYPES.map((type) =>
  type === "PractitionerRole" ? { ...ro(type), shared: true } : { ...rw(type), shared: true },
);
