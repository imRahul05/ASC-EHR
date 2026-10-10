import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccessRequestFormData } from "@asc/validation/auth";
import { getMe, requestAccess } from "./auth";
import { queryKeys } from "./react/query-keys";

afterEach(() => {
  vi.unstubAllGlobals();
});

const me = {
  principal: {
    kind: "staff",
    id: "user-1",
    membershipId: "membership-1",
    tenant: { tenantId: "t1", medplumProjectId: "p1" },
    grants: [{ scope: "facility", facilityId: "A", roleKeys: ["rn"], capabilities: ["case.read"] }],
  },
  facilities: [{ id: "A", name: "Facility A" }],
};

describe("getMe", () => {
  it("requests /me and returns the parsed principal", async () => {
    const fetchMock = vi.fn((_input: string) => Promise.resolve(Response.json(me)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getMe()).resolves.toEqual(me);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/me");
  });

  it("rejects a response that is not a valid principal", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ principal: { kind: "admin" }, facilities: [] })));
    await expect(getMe()).rejects.toThrow("Unexpected /me response shape");
  });

  it("posts an access request with only name, email and facility code, and returns nothing", async () => {
    const fetchMock = vi.fn((_input: string, _init?: RequestInit) => Promise.resolve(Response.json({ status: "received" }, { status: 202 })));
    vi.stubGlobal("fetch", fetchMock);
    const withRole = { fullName: "Jordan Reyes", email: "jordan@example.org", role: "ADMIN" } as AccessRequestFormData;
    await expect(requestAccess(withRole)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/auth/access-requests");
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    expect(JSON.parse(typeof body === "string" ? body : "{}")).toEqual({ fullName: "Jordan Reyes", email: "jordan@example.org" });
  });

  it("refuses to send an invalid access request", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({})));
    vi.stubGlobal("fetch", fetchMock);
    await expect(requestAccess({ fullName: "J", email: "nope" })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("has a stable query key under the auth domain", () => {
    expect(queryKeys.auth.me).toEqual(["auth", "me"]);
    expect(queryKeys.auth.me[0]).toBe(queryKeys.auth.all[0]);
  });
});

describe("web auth token helpers", () => {
  it("exchanges code and verifier via /api/auth/token", async () => {
    const mockResult = { accessToken: "access-123", idToken: "id-456", expiresIn: 900 };
    const fetchMock = vi.fn((_input: string, _init?: RequestInit) => Promise.resolve(Response.json(mockResult)));
    vi.stubGlobal("fetch", fetchMock);

    const { exchangeWebAuthCode } = await import("./auth");
    const result = await exchangeWebAuthCode("code-abc", "verifier-xyz");
    expect(result).toEqual(mockResult);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/auth/token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "code-abc", codeVerifier: "verifier-xyz" }),
      }),
    );
  });

  it("silently refreshes token via /api/auth/token", async () => {
    const mockResult = { accessToken: "access-refreshed", expiresIn: 900 };
    const fetchMock = vi.fn((_input: string, _init?: RequestInit) => Promise.resolve(Response.json(mockResult)));
    vi.stubGlobal("fetch", fetchMock);

    const { refreshWebAuthToken } = await import("./auth");
    const result = await refreshWebAuthToken();
    expect(result).toEqual(mockResult);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/auth/token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ grantType: "refresh_token" }),
      }),
    );
  });

  it("calls /api/auth/logout on logoutWebSession", async () => {
    const fetchMock = vi.fn((_input: string, _init?: RequestInit) => Promise.resolve(Response.json({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    const { logoutWebSession } = await import("./auth");
    await logoutWebSession();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/auth/logout",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("generates a PKCE code_verifier and S256 code_challenge", async () => {
    const { generatePkceChallenge } = await import("./auth");
    const pkce = await generatePkceChallenge();
    expect(pkce.codeChallengeMethod).toBe("S256");
    expect(typeof pkce.codeVerifier).toBe("string");
    expect(pkce.codeVerifier.length).toBeGreaterThan(30);
    expect(typeof pkce.codeChallenge).toBe("string");
    expect(pkce.codeChallenge.length).toBeGreaterThan(30);
    // Base64url safe chars only
    expect(pkce.codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(pkce.codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

