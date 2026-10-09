import { FakeIdentityPort } from "@asc/authz/testing";
import type { IdentityPort } from "@asc/authz";
import type { TenantRef } from "@asc/types";

import { DevIdentityPort } from "./dev-identity.js";
import { MedplumIdentityPort } from "./medplum.js";

export class IdentityAdapterRefusedError extends Error {
  constructor() {
    super(
      "No identity adapter is available: a real Medplum base URL is required in production and staging.",
    );
    this.name = "IdentityAdapterRefusedError";
  }
}

/**
 * Which `IdentityPort` the process uses. Locally it is the dev-only fake (unless Medplum is chosen).
 * In production and staging, the real Medplum adapter (P05i) is required.
 */
export function createIdentityPort(options: {
  production: boolean;
  tenant: TenantRef;
  medplumBaseUrl?: string;
  useMedplum?: boolean;
}): IdentityPort {
  if (options.production) {
    if (options.medplumBaseUrl === undefined || options.medplumBaseUrl.length === 0) {
      throw new IdentityAdapterRefusedError();
    }
    return new MedplumIdentityPort({ baseUrl: options.medplumBaseUrl });
  }
  if (options.useMedplum && options.medplumBaseUrl !== undefined && options.medplumBaseUrl.length > 0) {
    return new MedplumIdentityPort({ baseUrl: options.medplumBaseUrl });
  }
  return new DevIdentityPort(options.tenant);
}

/**
 * Defense in depth for any caller of `buildApp`: a fake adapter (dev identity or a
 * test double) is never accepted in production, whoever constructed it.
 */
export function assertIdentityAllowed(identity: IdentityPort, production: boolean): void {
  if (production && identity instanceof FakeIdentityPort) throw new IdentityAdapterRefusedError();
}
