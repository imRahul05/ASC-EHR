// Subset of the Medplum AccessPolicy JSON that the policy compiler emits
// (08 §7.4). Plain data: no @medplum/* dependency until P05h.

export interface AccessPolicyExpression {
  readonly language: "text/fhirpath";
  readonly expression: string;
}

export interface AccessPolicyResource {
  readonly resourceType: string;
  readonly criteria?: string;
  readonly readonly?: boolean;
  readonly hiddenFields?: readonly string[];
  readonly readonlyFields?: readonly string[];
  readonly writeConstraint?: readonly AccessPolicyExpression[];
}

export interface AccessPolicyTag {
  readonly system: string;
  readonly code: string;
  readonly version: string;
}

export interface AccessPolicy {
  readonly resourceType: "AccessPolicy";
  readonly name: string;
  readonly meta: { readonly tag: readonly [AccessPolicyTag] };
  readonly resource: readonly AccessPolicyResource[];
}
