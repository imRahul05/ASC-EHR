import type { Principal, TenantRef } from "@asc/types";

// Gate 1: which tenant is this request for? Input is the request host only;
// the tenant is never taken from a body or query string.
export interface TenantRequestInfo {
  readonly host?: string;
}

export interface TenantResolver {
  resolve(request: TenantRequestInfo): Promise<TenantRef | undefined>;
}

// Phase 1: one configured tenant. Host-based resolution waits for Customer #2.
export class StaticTenantResolver implements TenantResolver {
  constructor(private readonly tenant: TenantRef) {}

  resolve(): Promise<TenantRef | undefined> {
    return Promise.resolve(this.tenant);
  }
}

// Gate 2: who is this token? "wrong-project" = token not issued for the tenant's
// project. Adapters map `invalid-token`, `wrong-project`, `inactive-membership`
// to 401 and `unavailable` to 503 (never allow, never use a stale entry).
export type IdentityFailure = "invalid-token" | "wrong-project" | "inactive-membership" | "unavailable";

export type IdentityCacheState = "hit" | "miss" | "bypass";

export type IdentityResult =
  | { readonly ok: true; readonly principal: Principal; readonly cache: IdentityCacheState }
  | { readonly ok: false; readonly reason: IdentityFailure };

export interface IdentityPort {
  // `stepUp` asks the adapter to bypass its cache and re-validate.
  authenticate(token: string, tenant: TenantRef, options?: { readonly stepUp?: boolean }): Promise<IdentityResult>;
}
