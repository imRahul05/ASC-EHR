import type { Principal, TenantRef } from "@asc/types";
import type { IdentityPort, IdentityResult, TenantRequestInfo, TenantResolver } from "./ports";

// Test fakes. Production code must never import "@asc/authz/testing".
export class FakeIdentityPort implements IdentityPort {
  readonly calls: { token: string; stepUp: boolean }[] = [];
  private readonly principals = new Map<string, { principal: Principal; projectId: string }>();
  private unavailable = false;

  addToken(token: string, principal: Principal): void {
    this.principals.set(token, { principal, projectId: principal.tenant.medplumProjectId });
  }

  setUnavailable(value: boolean): void {
    this.unavailable = value;
  }

  authenticate(token: string, tenant: TenantRef, options?: { readonly stepUp?: boolean }): Promise<IdentityResult> {
    this.calls.push({ token, stepUp: options?.stepUp === true });
    if (this.unavailable) return Promise.resolve({ ok: false, reason: "unavailable" });
    const entry = this.principals.get(token);
    if (entry === undefined) return Promise.resolve({ ok: false, reason: "invalid-token" });
    if (entry.projectId !== tenant.medplumProjectId) return Promise.resolve({ ok: false, reason: "wrong-project" });
    return Promise.resolve({ ok: true, principal: entry.principal, cache: options?.stepUp === true ? "bypass" : "miss" });
  }
}

// Resolves by exact host, for tests of host-based routing.
export class FakeTenantResolver implements TenantResolver {
  constructor(private readonly byHost: Readonly<Record<string, TenantRef>>) {}

  resolve(request: TenantRequestInfo): Promise<TenantRef | undefined> {
    const host = request.host;
    return Promise.resolve(host !== undefined && Object.hasOwn(this.byHost, host) ? this.byHost[host] : undefined);
  }
}
export * from "./fixtures";
