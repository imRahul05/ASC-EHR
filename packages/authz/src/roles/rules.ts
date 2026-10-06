import type { ResourceRule } from "@asc/types";

// Data-rule shorthands for role templates (08 §7.4). A resource type that is
// not listed is not accessible, so "hidden" is expressed by omission.
export const rw = (resourceType: string): ResourceRule => ({ resourceType });

export const ro = (resourceType: string): ResourceRule => ({ resourceType, readonly: true });

// Directory data every staff role needs to render names, places and teams.
const REFERENCE_TYPES = ["Practitioner", "PractitionerRole", "Organization", "Location"];

export const REFERENCE_READ: readonly ResourceRule[] = REFERENCE_TYPES.map(ro);

// Administrators maintain the directory (admin.users, admin.facility).
export const REFERENCE_WRITE: readonly ResourceRule[] = REFERENCE_TYPES.map(rw);
