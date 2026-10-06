import type { AuditDetails, AuditEventInput, AuditGate } from "./index.js";

/**
 * Identity and access events (P05f). Details carry IDs, keys and enum values only:
 * no names, no emails, no free text. Who did it is `actorId` / `membershipId` on the event.
 */
export const IAM_ACTIONS = [
  "auth.login",
  "auth.logout",
  "auth.denied",
  "membership.activated",
  "membership.disabled",
  "membership.facility_granted",
  "membership.facility_revoked",
  "role.assigned",
  "role.revoked",
  "role.template_changed",
  "user.invited",
] as const;

export type IamAction = (typeof IAM_ACTIONS)[number];

export type AuthDeniedReason =
  | "missing-capability"
  | "wrong-facility"
  | "inactive-membership"
  | "wrong-project"
  | "invalid-token"
  | "unknown-tenant"
  | "policy-denied";

export type LogoutReason = "user" | "idle" | "absolute" | "revoked";

type TargetMembership = { targetMembershipId: string };

/** Typed details per action. `type` aliases (not interfaces) so they stay assignable to `AuditInputDetails`. */
export type IamEventDetails = {
  "auth.login": { mfa: boolean };
  "auth.logout": { reason: LogoutReason };
  /** `capability` is a catalog key; absent for gates 1 and 2. */
  "auth.denied": { reason: AuthDeniedReason; capability?: string };
  "membership.activated": TargetMembership;
  "membership.disabled": TargetMembership;
  "membership.facility_granted": TargetMembership & { targetFacilityId: string };
  "membership.facility_revoked": TargetMembership & { targetFacilityId: string };
  "role.assigned": TargetMembership & { roleKey: string; roleVersion: string; targetFacilityId?: string };
  "role.revoked": TargetMembership & { roleKey: string; roleVersion: string; targetFacilityId?: string };
  "role.template_changed": { roleKey: string; fromVersion: string; toVersion: string };
  "user.invited": { inviteId: string; targetMembershipId?: string };
};

type IamBase = Omit<AuditEventInput, "action" | "details">;

/** A denial must say which gate refused and is always `DENIED`. */
type IamBaseFor<A extends IamAction> = A extends "auth.denied"
  ? Omit<IamBase, "outcome" | "gate"> & { gate: AuditGate }
  : IamBase;

export function isIamAction(action: string): action is IamAction {
  return (IAM_ACTIONS as readonly string[]).includes(action);
}

/** Builds a typed IAM audit event. Send it with `auditClient.logEvent`. */
export function iamEvent<A extends IamAction>(
  action: A,
  base: IamBaseFor<A>,
  details: IamEventDetails[A],
): AuditEventInput {
  const outcome = action === "auth.denied" ? { outcome: "DENIED" as const } : {};
  return { ...(base as IamBase), ...outcome, action, details };
}

/** IDs, keys and versions only: no spaces, no `@`, bounded length. */
const ID_VALUE = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * IAM details may hold booleans and identifier-shaped strings. Anything else
 * (an email, a name) is an error outside production and is dropped, with the
 * event marked redacted, in production.
 */
export function sanitizeIamDetails(
  details: AuditDetails | undefined,
  production: boolean,
): { details?: AuditDetails; detailsRedacted?: boolean } {
  if (details === undefined) return {};
  const clean: AuditDetails = {};
  const offending: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === "string" && !ID_VALUE.test(value)) offending.push(key);
    else clean[key] = value;
  }
  if (offending.length === 0) return { details: clean };
  if (!production) throw new IamDetailsError(offending);
  return { details: clean, detailsRedacted: true };
}

export class IamDetailsError extends Error {
  constructor(readonly offendingKeys: string[]) {
    super(
      `IAM audit details rejected: keys [${offendingKeys.join(", ")}] must be identifiers ` +
        "(letters, digits, '.', '_', ':', '-'), never names, emails or free text.",
    );
    this.name = "IamDetailsError";
  }
}
