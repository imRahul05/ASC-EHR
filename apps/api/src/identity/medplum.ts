import { createHash } from "node:crypto";
import { createOnBehalfClient, fetchAuthMe, type MedplumAuthMe, type MedplumClient } from "@asc/api-client/server";
import { grantsFromPractitionerRoles, roleRegistry, type IdentityCacheState, type IdentityPort, type IdentityResult } from "@asc/authz";
import type { StaffPrincipal, TenantRef } from "@asc/types";
import type { PractitionerRole } from "@medplum/fhirtypes";

interface MedplumIdentityPortOptions {
  readonly baseUrl: string;
  readonly createClient?: (args: { baseUrl: string; accessToken: string }) => MedplumClient;
  readonly now?: () => number;
}

interface CacheEntry {
  readonly me: MedplumAuthMe;
  readonly expiresAt: number;
}

function sha256(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

interface JwtPayload {
  readonly exp?: number;
}

interface MedplumErrorLike {
  readonly name?: string;
  readonly message?: string;
  readonly status?: number;
  readonly outcome?: {
    readonly id?: string;
    readonly issue?: readonly { readonly code?: string }[];
  };
}

function tokenExpirationMs(token: string, now: number): number {
  try {
    const parts = token.split(".");
    if (parts.length === 3 && parts[1] !== undefined) {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as JwtPayload;
      if (typeof payload.exp === "number") {
        const expMs = payload.exp * 1000;
        if (expMs > now) return expMs;
      }
    }
  } catch {
    // If not a parseable JWT, use default TTL
  }
  return now + 15 * 60 * 1000;
}

function isUnauthorized(err: MedplumErrorLike): boolean {
  if (err.status === 401 || err.message === "Unauthorized" || err.outcome?.id === "unauthorized") {
    return true;
  }
  return err.outcome?.issue?.some((issue) => issue.code === "login" || issue.code === "security") ?? false;
}

/**
 * Gate 2 identity adapter for Medplum (P05i, #57).
 *
 * Verifies bearer tokens on behalf of the calling user at the configured Medplum server.
 * `/auth/me` is cached in memory by token hash (never the raw token) for the token's lifetime.
 * PractitionerRole grants are read with the user's token on every request, ensuring instant revocation.
 */
export class MedplumIdentityPort implements IdentityPort {
  private readonly baseUrl: string;
  private readonly createClient: (args: { baseUrl: string; accessToken: string }) => MedplumClient;
  private readonly now: () => number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: MedplumIdentityPortOptions) {
    this.baseUrl = options.baseUrl;
    this.createClient = options.createClient ?? createOnBehalfClient;
    this.now = options.now ?? Date.now;
  }

  async authenticate(token: string, tenant: TenantRef): Promise<IdentityResult> {
    const currentTime = this.now();
    const tokenHash = sha256(token);

    // Evict expired cache entry if present
    const cached = this.cache.get(tokenHash);
    if (cached !== undefined && cached.expiresAt <= currentTime) {
      this.cache.delete(tokenHash);
    }

    const activeCached = this.cache.get(tokenHash);
    let me: MedplumAuthMe;
    let cacheState: IdentityCacheState;

    const client = this.createClient({ baseUrl: this.baseUrl, accessToken: token });

    if (activeCached !== undefined) {
      me = activeCached.me;
      cacheState = "hit";
    } else {
      try {
        me = await fetchAuthMe(client);
      } catch (err) {
        if (isUnauthorized(err as MedplumErrorLike)) {
          return { ok: false, reason: "invalid-token" };
        }
        return { ok: false, reason: "unavailable" };
      }

      const expiresAt = tokenExpirationMs(token, currentTime);
      this.cache.set(tokenHash, { me, expiresAt });
      cacheState = "miss";
    }

    // Gate 2 check 1: wrong project
    if (me.project?.id !== undefined && me.project.id !== tenant.medplumProjectId) {
      return { ok: false, reason: "wrong-project" };
    }

    const membership = me.membership;
    if (membership === undefined) {
      return { ok: false, reason: "invalid-token" };
    }

    // Gate 2 check 2: inactive membership
    if (membership.active === false) {
      return { ok: false, reason: "inactive-membership" };
    }

    // Grants read with user's token on every request (never cached across requests, #57)
    const profileRef = membership.profile?.reference ?? (me.profile?.id ? `Practitioner/${me.profile.id}` : undefined);
    let roles: PractitionerRole[] = [];
    if (profileRef !== undefined) {
      try {
        roles = await client.searchResources("PractitionerRole", {
          practitioner: profileRef,
          active: "true",
        });
      } catch (err) {
        if (isUnauthorized(err as MedplumErrorLike)) {
          return { ok: false, reason: "invalid-token" };
        }
        return { ok: false, reason: "unavailable" };
      }
    }

    const grants = grantsFromPractitionerRoles(roles, roleRegistry);

    const principal: StaffPrincipal = {
      kind: "staff",
      id: me.profile?.id ?? me.user?.id ?? "unknown",
      membershipId: membership.id ?? "unknown",
      tenant: {
        tenantId: tenant.tenantId,
        medplumProjectId: tenant.medplumProjectId,
      },
      grants,
    };

    return {
      ok: true,
      principal,
      cache: cacheState,
    };
  }
}
