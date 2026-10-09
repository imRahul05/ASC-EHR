import type * as AscApiClient from "@asc/api-client";
import type * as TanstackQuery from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "./use-auth";
import { getPendingCodeVerifier, setPendingCodeVerifier } from "../lib/auth/pkce";
import { useAuthStore } from "../lib/stores/auth.store";

const mockRouter = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

const mockQueryClient = {
  removeQueries: vi.fn(),
  clear: vi.fn(),
};
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof TanstackQuery>("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => mockQueryClient,
    useQuery: vi.fn(() => ({ data: undefined })),
    useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  };
});

const mockMedplumClient = {
  startLogin: vi.fn(),
  post: vi.fn(),
  setAccessToken: vi.fn(),
  signOut: vi.fn(),
};

vi.mock("@asc/api-client", async () => {
  const actual = await vi.importActual<typeof AscApiClient>("@asc/api-client");
  return {
    ...actual,
    getBrowserMedplumClient: () => mockMedplumClient,
    generatePkceChallenge: () => Promise.resolve({
      codeVerifier: "test-verifier-123",
      codeChallenge: "test-challenge-456",
      codeChallengeMethod: "S256" as const,
    }),
    exchangeWebAuthCode: vi.fn(() => Promise.resolve({
      accessToken: "mock-access-token",
      idToken: "mock-id-token",
      expiresIn: 900,
    })),
    refreshWebAuthToken: vi.fn(() => Promise.resolve({
      accessToken: "refreshed-access-token",
      idToken: "refreshed-id-token",
      expiresIn: 900,
    })),
    logoutWebSession: vi.fn(() => Promise.resolve()),
    getMe: vi.fn(() => Promise.resolve({
      principal: {
        kind: "staff" as const,
        id: "staff-1",
        membershipId: "mem-1",
        tenant: { tenantId: "t1", medplumProjectId: "p1" },
        grants: [{ scope: "facility" as const, facilityId: "fac-1", roleKeys: ["rn"], capabilities: ["case.read"] }],
      },
      facilities: [{ id: "fac-1", name: "Main Facility" }],
    })),
  };
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

function getAuthHook(): ReturnType<typeof useAuth> {
  let captured: ReturnType<typeof useAuth> | undefined;
  function TestComp() {
    captured = useAuth();
    return null;
  }
  renderToStaticMarkup(createElement(TestComp));
  if (captured === undefined) throw new Error("Failed to capture useAuth hook");
  return captured;
}

describe("useAuth with Medplum PKCE and TOTP", () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("handles MFA required challenge during login", async () => {
    mockMedplumClient.startLogin.mockResolvedValueOnce({
      login: "login-session-abc",
      mfaRequired: true,
    });

    const { login } = getAuthHook();
    const result = await login({ email: "nurse@center.org", password: "secret-password" });

    expect(result.status).toBe("mfa_required");
    if (result.status === "mfa_required") {
      expect(result.challenge.loginId).toBe("login-session-abc");
      expect(result.challenge.codeVerifier).toBe("test-verifier-123");
      expect(result.challenge.email).toBe("nurse@center.org");
    }
    expect(useAuthStore.getState().session).toBeNull();
  });

  it("completes login directly when MFA is not required", async () => {
    mockMedplumClient.startLogin.mockResolvedValueOnce({
      login: "login-session-xyz",
      mfaRequired: false,
      code: "auth-code-789",
    });

    const { login } = getAuthHook();
    const result = await login({ email: "nurse@center.org", password: "secret-password" });

    expect(result.status).toBe("complete");
    expect(mockMedplumClient.setAccessToken).toHaveBeenCalledWith("mock-access-token");
    expect(useAuthStore.getState().session?.token).toBe("mock-access-token");
    expect(useAuthStore.getState().idToken).toBe("mock-id-token");
    expect(useAuthStore.getState().principal?.id).toBe("staff-1");
  });

  it("verifies TOTP code and completes session", async () => {
    mockMedplumClient.post.mockResolvedValueOnce({
      code: "auth-code-from-mfa",
    });

    const { verifyTotp } = getAuthHook();
    await verifyTotp({
      loginId: "login-session-abc",
      code: "123456",
      codeVerifier: "test-verifier-123",
      email: "nurse@center.org",
    });

    expect(mockMedplumClient.post).toHaveBeenCalledWith("auth/mfa/verify", {
      login: "login-session-abc",
      token: "123456",
    });
    expect(mockMedplumClient.setAccessToken).toHaveBeenCalledWith("mock-access-token");
    expect(useAuthStore.getState().session?.token).toBe("mock-access-token");
    expect(useAuthStore.getState().idToken).toBe("mock-id-token");
  });

  it("restores session silently using refresh token", async () => {
    const { restoreSession } = getAuthHook();
    const restored = await restoreSession();

    expect(restored).toBe(true);
    expect(mockMedplumClient.setAccessToken).toHaveBeenCalledWith("refreshed-access-token");
    expect(useAuthStore.getState().session?.token).toBe("refreshed-access-token");
    expect(useAuthStore.getState().idToken).toBe("refreshed-id-token");
  });

  it("clears Medplum session, web session, and query cache on logout", async () => {
    setPendingCodeVerifier("pending-verifier-xyz");
    expect(getPendingCodeVerifier()).toBe("pending-verifier-xyz");

    const { logout } = getAuthHook();
    await logout();

    expect(mockMedplumClient.signOut).toHaveBeenCalled();
    expect(mockQueryClient.clear).toHaveBeenCalled();
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().idToken).toBeNull();
    expect(getPendingCodeVerifier()).toBe("");
    expect(mockRouter.push).toHaveBeenCalledWith("/login");
  });
});
