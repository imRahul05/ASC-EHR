import { describe, expect, it, vi } from "vitest";
import { createOnBehalfClient, type MedplumAuthMe, type MedplumClient } from "@asc/api-client/server";
import { ROLE_TEMPLATE_CODE_SYSTEM } from "@asc/authz";
import type { TenantRef } from "@asc/types";
import type { PractitionerRole } from "@medplum/fhirtypes";

import { MedplumIdentityPort } from "./medplum.js";

const TEST_TENANT: TenantRef = {
  tenantId: "tenant-asc-1",
  medplumProjectId: "proj-123",
};

function createJwt(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString("base64url");
  return `${header}.${payload}.sig`;
}

describe("MedplumIdentityPort", () => {
  it("authenticates a valid user, returning staff principal and cache miss on first request", async () => {
    const authMe: MedplumAuthMe = {
      user: { id: "user-1", resourceType: "User" },
      project: { id: "proj-123", resourceType: "Project" },
      membership: {
        id: "mem-1",
        profile: { reference: "Practitioner/prac-1" },
        active: true,
      },
      profile: { id: "prac-1", resourceType: "Practitioner" },
    };

    const roles: PractitionerRole[] = [
      {
        resourceType: "PractitionerRole",
        id: "role-1",
        active: true,
        practitioner: { reference: "Practitioner/prac-1" },
        code: [
          {
            coding: [{ system: ROLE_TEMPLATE_CODE_SYSTEM, code: "gi-physician" }],
          },
        ],
        organization: { reference: "Organization/fac-1" },
      },
    ];

    let meCalls = 0;
    let searchCalls = 0;

    const port = new MedplumIdentityPort({
      baseUrl: "http://localhost:8203/",
      createClient: ({ baseUrl, accessToken }): MedplumClient => {
        const client = createOnBehalfClient({ baseUrl, accessToken });
        vi.spyOn(client, "get").mockImplementation(((url: string | URL) => {
          if (String(url) === "auth/me") {
            meCalls += 1;
            return Promise.resolve(authMe);
          }
          throw new Error(`Unexpected path: ${String(url)}`);
        }) as never);
        vi.spyOn(client, "searchResources").mockImplementation((() => {
          searchCalls += 1;
          return Promise.resolve(roles);
        }) as never);
        return client;
      },
    });

    const token = createJwt(Math.floor(Date.now() / 1000) + 900);
    const result = await port.authenticate(token, TEST_TENANT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.principal.kind !== "staff") throw new Error("Expected staff principal");

    expect(result.cache).toBe("miss");
    expect(result.principal.id).toBe("prac-1");
    expect(result.principal.membershipId).toBe("mem-1");
    expect(result.principal.tenant.medplumProjectId).toBe("proj-123");
    expect(result.principal.grants).toHaveLength(1);
    expect(result.principal.grants[0]).toMatchObject({
      scope: "facility",
      facilityId: "fac-1",
      roleKeys: ["gi-physician"],
    });
    expect(result.principal.grants[0]?.capabilities).toContain("case.read");
    expect(meCalls).toBe(1);
    expect(searchCalls).toBe(1);
  });

  it("caches /auth/me by token hash: second request hits cache but reads PractitionerRoles fresh", async () => {
    const authMe: MedplumAuthMe = {
      user: { id: "user-1", resourceType: "User" },
      project: { id: "proj-123", resourceType: "Project" },
      membership: {
        id: "mem-1",
        profile: { reference: "Practitioner/prac-1" },
        active: true,
      },
      profile: { id: "prac-1", resourceType: "Practitioner" },
    };

    let meCalls = 0;
    let searchCalls = 0;
    let currentRoles: PractitionerRole[] = [
      {
        resourceType: "PractitionerRole",
        id: "role-1",
        active: true,
        practitioner: { reference: "Practitioner/prac-1" },
        code: [{ coding: [{ system: ROLE_TEMPLATE_CODE_SYSTEM, code: "rn" }] }],
        organization: { reference: "Organization/fac-1" },
      },
    ];

    const port = new MedplumIdentityPort({
      baseUrl: "http://localhost:8203/",
      createClient: ({ baseUrl, accessToken }): MedplumClient => {
        const client = createOnBehalfClient({ baseUrl, accessToken });
        vi.spyOn(client, "get").mockImplementation(((url: string | URL) => {
          if (String(url) === "auth/me") {
            meCalls += 1;
            return Promise.resolve(authMe);
          }
          throw new Error(`Unexpected path: ${String(url)}`);
        }) as never);
        vi.spyOn(client, "searchResources").mockImplementation((() => {
          searchCalls += 1;
          return Promise.resolve(currentRoles);
        }) as never);
        return client;
      },
    });

    const token = createJwt(Math.floor(Date.now() / 1000) + 900);

    // First request: miss
    const firstResult = await port.authenticate(token, TEST_TENANT);
    expect(firstResult.ok).toBe(true);
    if (!firstResult.ok) return;
    expect(firstResult.cache).toBe("miss");
    expect(meCalls).toBe(1);
    expect(searchCalls).toBe(1);

    // Update roles (e.g. administrator revoked nurse role)
    currentRoles = [];

    // Second request: hit for /auth/me, but fresh search for PractitionerRoles (#57)
    const secondResult = await port.authenticate(token, TEST_TENANT);
    expect(secondResult.ok).toBe(true);
    if (!secondResult.ok) return;
    expect(secondResult.cache).toBe("hit");
    expect(meCalls).toBe(1); // Cached! No additional /auth/me call
    expect(searchCalls).toBe(2); // Fresh! PractitionerRole re-queried
    expect(secondResult.principal.grants).toEqual([]);
  });

  it("evicts expired tokens from cache based on JWT exp", async () => {
    let nowTime = 1_000_000_000_000;
    let meCalls = 0;

    const authMe: MedplumAuthMe = {
      user: { id: "user-1", resourceType: "User" },
      project: { id: "proj-123", resourceType: "Project" },
      membership: { id: "mem-1", profile: { reference: "Practitioner/prac-1" } },
      profile: { id: "prac-1", resourceType: "Practitioner" },
    };

    const port = new MedplumIdentityPort({
      baseUrl: "http://localhost:8203/",
      now: () => nowTime,
      createClient: ({ baseUrl, accessToken }): MedplumClient => {
        const client = createOnBehalfClient({ baseUrl, accessToken });
        vi.spyOn(client, "get").mockImplementation((() => {
          meCalls += 1;
          return Promise.resolve(authMe);
        }) as never);
        vi.spyOn(client, "searchResources").mockResolvedValue([] as never);
        return client;
      },
    });

    // Token expires in 100 seconds
    const expSeconds = Math.floor(nowTime / 1000) + 100;
    const token = createJwt(expSeconds);

    const first = await port.authenticate(token, TEST_TENANT);
    expect(first.ok).toBe(true);
    expect(meCalls).toBe(1);

    // Advance time past expiration
    nowTime += 101 * 1000;

    const second = await port.authenticate(token, TEST_TENANT);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.cache).toBe("miss");
    expect(meCalls).toBe(2); // Evicted and re-fetched
  });

  it("rejects authentication with wrong-project when user belongs to a different Medplum project", async () => {
    const port = new MedplumIdentityPort({
      baseUrl: "http://localhost:8203/",
      createClient: ({ baseUrl, accessToken }): MedplumClient => {
        const client = createOnBehalfClient({ baseUrl, accessToken });
        vi.spyOn(client, "get").mockResolvedValue({
          project: { id: "wrong-project-id" },
          membership: { id: "mem-1" },
        });
        return client;
      },
    });

    const result = await port.authenticate("token", TEST_TENANT);
    expect(result).toEqual({ ok: false, reason: "wrong-project" });
  });

  it("rejects authentication with inactive-membership when membership.active is false", async () => {
    const port = new MedplumIdentityPort({
      baseUrl: "http://localhost:8203/",
      createClient: ({ baseUrl, accessToken }): MedplumClient => {
        const client = createOnBehalfClient({ baseUrl, accessToken });
        vi.spyOn(client, "get").mockResolvedValue({
          project: { id: "proj-123" },
          membership: { id: "mem-1", active: false },
        });
        return client;
      },
    });

    const result = await port.authenticate("token", TEST_TENANT);
    expect(result).toEqual({ ok: false, reason: "inactive-membership" });
  });

  it("rejects authentication with invalid-token when membership is missing", async () => {
    const port = new MedplumIdentityPort({
      baseUrl: "http://localhost:8203/",
      createClient: ({ baseUrl, accessToken }): MedplumClient => {
        const client = createOnBehalfClient({ baseUrl, accessToken });
        vi.spyOn(client, "get").mockResolvedValue({
          project: { id: "proj-123" },
        });
        return client;
      },
    });

    const result = await port.authenticate("token", TEST_TENANT);
    expect(result).toEqual({ ok: false, reason: "invalid-token" });
  });

  it("handles Medplum 401 Unauthorized by returning invalid-token", async () => {
    const port = new MedplumIdentityPort({
      baseUrl: "http://localhost:8203/",
      createClient: ({ baseUrl, accessToken }): MedplumClient => {
        const client = createOnBehalfClient({ baseUrl, accessToken });
        vi.spyOn(client, "get").mockRejectedValue({
          status: 401,
          message: "Unauthorized",
        });
        return client;
      },
    });

    const result = await port.authenticate("bad-token", TEST_TENANT);
    expect(result).toEqual({ ok: false, reason: "invalid-token" });
  });

  it("handles Medplum server downtime or network errors by returning unavailable", async () => {
    const port = new MedplumIdentityPort({
      baseUrl: "http://localhost:8203/",
      createClient: ({ baseUrl, accessToken }): MedplumClient => {
        const client = createOnBehalfClient({ baseUrl, accessToken });
        vi.spyOn(client, "get").mockRejectedValue(new Error("ECONNREFUSED"));
        return client;
      },
    });

    const result = await port.authenticate("token", TEST_TENANT);
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("handles 401 during PractitionerRole query by returning invalid-token", async () => {
    const port = new MedplumIdentityPort({
      baseUrl: "http://localhost:8203/",
      createClient: ({ baseUrl, accessToken }): MedplumClient => {
        const client = createOnBehalfClient({ baseUrl, accessToken });
        vi.spyOn(client, "get").mockResolvedValue({
          project: { id: "proj-123" },
          membership: { id: "mem-1", profile: { reference: "Practitioner/p1" } },
        });
        vi.spyOn(client, "searchResources").mockRejectedValue({
          status: 401,
          message: "Unauthorized",
        });
        return client;
      },
    });

    const result = await port.authenticate("token", TEST_TENANT);
    expect(result).toEqual({ ok: false, reason: "invalid-token" });
  });

  it("handles server error during PractitionerRole query by returning unavailable", async () => {
    const port = new MedplumIdentityPort({
      baseUrl: "http://localhost:8203/",
      createClient: ({ baseUrl, accessToken }): MedplumClient => {
        const client = createOnBehalfClient({ baseUrl, accessToken });
        vi.spyOn(client, "get").mockResolvedValue({
          project: { id: "proj-123" },
          membership: { id: "mem-1", profile: { reference: "Practitioner/p1" } },
        });
        vi.spyOn(client, "searchResources").mockRejectedValue(new Error("Search timed out"));
        return client;
      },
    });

    const result = await port.authenticate("token", TEST_TENANT);
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("bypasses cache when stepUp option is true", async () => {
    let meCalls = 0;
    const authMe: MedplumAuthMe = {
      project: { id: "proj-123" },
      membership: { id: "mem-1", profile: { reference: "Practitioner/p1" } },
    };

    const port = new MedplumIdentityPort({
      baseUrl: "http://localhost:8203/",
      createClient: ({ baseUrl, accessToken }): MedplumClient => {
        const client = createOnBehalfClient({ baseUrl, accessToken });
        vi.spyOn(client, "get").mockImplementation((() => {
          meCalls += 1;
          return Promise.resolve(authMe);
        }) as never);
        vi.spyOn(client, "searchResources").mockResolvedValue([] as never);
        return client;
      },
    });

    const token = createJwt(Math.floor(Date.now() / 1000) + 900);
    const first = await port.authenticate(token, TEST_TENANT);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.cache).toBe("miss");
    expect(meCalls).toBe(1);

    // Regular request hits cache
    const second = await port.authenticate(token, TEST_TENANT);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.cache).toBe("hit");
    expect(meCalls).toBe(1);

    // stepUp request bypasses cache
    const stepUpResult = await port.authenticate(token, TEST_TENANT, { stepUp: true });
    expect(stepUpResult.ok).toBe(true);
    if (!stepUpResult.ok) return;
    expect(stepUpResult.cache).toBe("bypass");
    expect(meCalls).toBe(2);
  });

  it("fails closed when project ID is undefined or missing in MedplumAuthMe", async () => {
    const port = new MedplumIdentityPort({
      baseUrl: "http://localhost:8203/",
      createClient: ({ baseUrl, accessToken }): MedplumClient => {
        const client = createOnBehalfClient({ baseUrl, accessToken });
        vi.spyOn(client, "get").mockResolvedValue({
          membership: { id: "mem-1", profile: { reference: "Practitioner/p1" } },
        });
        return client;
      },
    });

    const result = await port.authenticate("token", TEST_TENANT);
    expect(result).toEqual({ ok: false, reason: "wrong-project" });
  });

  it("fails closed when actor ID or membership ID is missing", async () => {
    const port = new MedplumIdentityPort({
      baseUrl: "http://localhost:8203/",
      createClient: ({ baseUrl, accessToken }): MedplumClient => {
        const client = createOnBehalfClient({ baseUrl, accessToken });
        vi.spyOn(client, "get").mockResolvedValue({
          project: { id: "proj-123" },
          membership: { id: "" }, // empty membership ID
        });
        return client;
      },
    });

    const result = await port.authenticate("token", TEST_TENANT);
    expect(result).toEqual({ ok: false, reason: "invalid-token" });
  });

  it("handles HTTP 403 Forbidden as invalid-token", async () => {
    const port = new MedplumIdentityPort({
      baseUrl: "http://localhost:8203/",
      createClient: ({ baseUrl, accessToken }): MedplumClient => {
        const client = createOnBehalfClient({ baseUrl, accessToken });
        vi.spyOn(client, "get").mockRejectedValue({
          status: 403,
          message: "Forbidden",
        });
        return client;
      },
    });

    const result = await port.authenticate("forbidden-token", TEST_TENANT);
    expect(result).toEqual({ ok: false, reason: "invalid-token" });
  });

  it("evicts cached token when searchResources encounters 401 Unauthorized", async () => {
    let meCalls = 0;
    let searchShouldFail = false;

    const authMe: MedplumAuthMe = {
      project: { id: "proj-123" },
      membership: { id: "mem-1", profile: { reference: "Practitioner/p1" } },
    };

    const port = new MedplumIdentityPort({
      baseUrl: "http://localhost:8203/",
      createClient: ({ baseUrl, accessToken }): MedplumClient => {
        const client = createOnBehalfClient({ baseUrl, accessToken });
        vi.spyOn(client, "get").mockImplementation((() => {
          meCalls += 1;
          return Promise.resolve(authMe);
        }) as never);
        vi.spyOn(client, "searchResources").mockImplementation((() => {
          if (searchShouldFail) {
            return Promise.reject(Object.assign(new Error("Unauthorized"), { status: 401 }));
          }
          return Promise.resolve([]);
        }) as never);
        return client;
      },
    });

    const token = createJwt(Math.floor(Date.now() / 1000) + 900);

    // Initial successful call
    const first = await port.authenticate(token, TEST_TENANT);
    expect(first.ok).toBe(true);
    expect(meCalls).toBe(1);

    // Next call fails during search (revocation mid-flight)
    searchShouldFail = true;
    const second = await port.authenticate(token, TEST_TENANT);
    expect(second).toEqual({ ok: false, reason: "invalid-token" });

    // Next call should have had its cache evicted, so get() must be called again
    searchShouldFail = false;
    const third = await port.authenticate(token, TEST_TENANT);
    expect(third.ok).toBe(true);
    expect(meCalls).toBe(2); // /auth/me was re-fetched because cache was evicted
  });

  it("does not cache already-expired JWTs", async () => {
    let meCalls = 0;
    const authMe: MedplumAuthMe = {
      project: { id: "proj-123" },
      membership: { id: "mem-1", profile: { reference: "Practitioner/p1" } },
    };

    const port = new MedplumIdentityPort({
      baseUrl: "http://localhost:8203/",
      createClient: ({ baseUrl, accessToken }): MedplumClient => {
        const client = createOnBehalfClient({ baseUrl, accessToken });
        vi.spyOn(client, "get").mockImplementation((() => {
          meCalls += 1;
          return Promise.resolve(authMe);
        }) as never);
        vi.spyOn(client, "searchResources").mockResolvedValue([] as never);
        return client;
      },
    });

    // Token expired 10 seconds ago
    const expiredToken = createJwt(Math.floor(Date.now() / 1000) - 10);
    const first = await port.authenticate(expiredToken, TEST_TENANT);
    expect(first.ok).toBe(true);
    expect(meCalls).toBe(1);

    // Second call with the same expired token should not hit cache
    const second = await port.authenticate(expiredToken, TEST_TENANT);
    expect(second.ok).toBe(true);
    expect(meCalls).toBe(2);
  });
});
