import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { isOriginAllowed, POST as tokenHandler, REFRESH_COOKIE_NAME, SESSION_START_COOKIE_NAME } from "./route";
import { POST as logoutHandler } from "../logout/route";

describe("token route handler", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_MEDPLUM_BASE_URL: "http://localhost:8203/",
      NEXT_PUBLIC_MEDPLUM_CLIENT_ID: "client-web-123",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("exchanges authorization code and code_verifier with Medplum and sets httpOnly refresh cookie", async () => {
    const medplumTokens = {
      access_token: "mock-access-token",
      id_token: "mock-id-token",
      refresh_token: "mock-refresh-token",
      expires_in: 900,
    };

    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify(medplumTokens), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost:3000/api/auth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "auth-code-123", codeVerifier: "verifier-456" }),
    });

    const response = await tokenHandler(request);
    expect(response.status).toBe(200);

    const data = (await response.json()) as { accessToken: string; idToken: string; expiresIn: number };
    expect(data.accessToken).toBe("mock-access-token");
    expect(data.idToken).toBe("mock-id-token");
    expect(data.expiresIn).toBe(900);

    const cookie = response.cookies.get(REFRESH_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBe("mock-refresh-token");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("strict");
    expect(cookie?.path).toBe("/api/auth");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8203/oauth2/token",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("rejects code exchange when code or verifier is missing", async () => {
    const request = new NextRequest("http://localhost:3000/api/auth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "" }),
    });

    const response = await tokenHandler(request);
    expect(response.status).toBe(400);
  });

  it("silently refreshes token using refresh cookie", async () => {
    const medplumTokens = {
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      expires_in: 900,
    };

    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(medplumTokens), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost:3000/api/auth/token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({ grantType: "refresh_token" }),
    });
    request.cookies.set(REFRESH_COOKIE_NAME, "existing-refresh-token");
    request.cookies.set(SESSION_START_COOKIE_NAME, String(Date.now()));

    const response = await tokenHandler(request);
    expect(response.status).toBe(200);

    const data = (await response.json()) as { accessToken: string };
    expect(data.accessToken).toBe("new-access-token");

    const cookie = response.cookies.get(REFRESH_COOKIE_NAME);
    expect(cookie?.value).toBe("new-refresh-token");
  });

  it("rejects silent refresh if session start cookie is missing (fail-closed)", async () => {
    const request = new NextRequest("http://localhost:3000/api/auth/token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({ grantType: "refresh_token" }),
    });
    request.cookies.set(REFRESH_COOKIE_NAME, "existing-refresh-token");

    const response = await tokenHandler(request);
    expect(response.status).toBe(401);

    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("session_expired");
  });

  it("rejects silent refresh and clears cookies when 12-hour session limit is exceeded", async () => {
    const request = new NextRequest("http://localhost:3000/api/auth/token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({ grantType: "refresh_token" }),
    });
    request.cookies.set(REFRESH_COOKIE_NAME, "existing-refresh-token");
    // Session started 13 hours ago (exceeding 12-hour limit)
    const thirteenHoursAgo = Date.now() - 13 * 60 * 60 * 1000;
    request.cookies.set(SESSION_START_COOKIE_NAME, String(thirteenHoursAgo));

    const response = await tokenHandler(request);
    expect(response.status).toBe(401);

    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("session_expired");

    const refreshCookie = response.cookies.get(REFRESH_COOKIE_NAME);
    expect(refreshCookie?.maxAge).toBe(0);

    const sessionStartCookie = response.cookies.get(SESSION_START_COOKIE_NAME);
    expect(sessionStartCookie?.maxAge).toBe(0);
  });

  it("rejects silent refresh if refresh cookie is missing", async () => {
    const request = new NextRequest("http://localhost:3000/api/auth/token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({ grantType: "refresh_token" }),
    });

    const response = await tokenHandler(request);
    expect(response.status).toBe(401);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("no_refresh_token");
  });

  it("blocks cross-origin refresh attempts", async () => {
    const request = new NextRequest("http://localhost:3000/api/auth/token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.attacker.com",
      },
      body: JSON.stringify({ grantType: "refresh_token" }),
    });

    const response = await tokenHandler(request);
    expect(response.status).toBe(403);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("forbidden_origin");
  });

  it("clears refresh cookie when Medplum refresh request fails", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response("invalid_grant", {
          status: 400,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost:3000/api/auth/token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({ grantType: "refresh_token" }),
    });
    request.cookies.set(REFRESH_COOKIE_NAME, "revoked-token");

    const response = await tokenHandler(request);
    expect(response.status).toBe(401);

    const cookie = response.cookies.get(REFRESH_COOKIE_NAME);
    expect(cookie?.maxAge).toBe(0);
  });
});

describe("logout route handler", () => {
  it("clears the refresh cookie with maxAge 0 for allowed origins", async () => {
    const request = new NextRequest("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
      },
    });
    const response = logoutHandler(request);
    expect(response.status).toBe(200);

    const data = (await response.json()) as { ok: boolean };
    expect(data.ok).toBe(true);

    const cookie = response.cookies.get(REFRESH_COOKIE_NAME);
    expect(cookie?.maxAge).toBe(0);
    expect(cookie?.path).toBe("/api/auth");
  });

  it("blocks cross-origin logout attempts", async () => {
    const request = new NextRequest("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: {
        origin: "https://evil.attacker.com",
      },
    });
    const response = logoutHandler(request);
    expect(response.status).toBe(403);

    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("forbidden_origin");
  });
});

describe("isOriginAllowed", () => {
  it("allows same-origin requests", () => {
    const req = new NextRequest("http://localhost:3000/api/auth/token", {
      headers: {
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
      },
    });
    expect(isOriginAllowed(req)).toBe(true);
  });

  it("denies requests with cross-site sec-fetch-site", () => {
    const req = new NextRequest("http://localhost:3000/api/auth/token", {
      headers: {
        origin: "http://localhost:3000",
        "sec-fetch-site": "cross-site",
      },
    });
    expect(isOriginAllowed(req)).toBe(false);
  });

  it("validates referer when origin header is absent", () => {
    const validReq = new NextRequest("http://localhost:3000/api/auth/token", {
      headers: {
        referer: "http://localhost:3000/login",
      },
    });
    expect(isOriginAllowed(validReq)).toBe(true);

    const evilReq = new NextRequest("http://localhost:3000/api/auth/token", {
      headers: {
        referer: "https://malicious-site.com/attack",
      },
    });
    expect(isOriginAllowed(evilReq)).toBe(false);
  });
});
