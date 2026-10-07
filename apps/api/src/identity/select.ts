import { FakeIdentityPort } from "@asc/authz/testing";
import type { IdentityPort } from "@asc/authz";
import type { TenantRef } from "@asc/types";

import { DevIdentityPort } from "./dev-identity.js";

export class IdentityAdapterRefusedError extends Error {
  constructor() {
    super(
      "No identity adapter is available for production or staging: the dev-only fake is refused and the " +
        "Medplum adapter arrives with P05i. The API will not start without a real identity provider.",
    );
    this.name = "IdentityAdapterRefusedError";
  }
}

/**
 * Which `IdentityPort` the process uses. Locally it is the dev-only fake. In
 * production and staging there must be a real adapter (Medplum, P05i); until then
 * the process refuses to start rather than accept tokens it cannot verify.
 */
export function createIdentityPort(options: { production: boolean; tenant: TenantRef }): IdentityPort {
  if (options.production) throw new IdentityAdapterRefusedError();
  return new DevIdentityPort(options.tenant);
}

/**
 * Defense in depth for any caller of `buildApp`: a fake adapter (dev identity or a
 * test double) is never accepted in production, whoever constructed it.
 */
export function assertIdentityAllowed(identity: IdentityPort, production: boolean): void {
  if (production && identity instanceof FakeIdentityPort) throw new IdentityAdapterRefusedError();
}
