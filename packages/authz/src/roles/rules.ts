import type { ResourceRule } from "@asc/types";

// Data-rule shorthands for role templates (08 §7.4). A resource type that is
// not listed is not accessible, so "hidden" is expressed by omission.
export const rw = (resourceType: string): ResourceRule => ({ resourceType });

export const ro = (resourceType: string): ResourceRule => ({ resourceType, readonly: true });
