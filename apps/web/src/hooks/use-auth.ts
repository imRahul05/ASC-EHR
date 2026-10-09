"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  exchangeWebAuthCode,
  generatePkceChallenge,
  getBrowserMedplumClient,
  getDemoPresets,
  getMe,
  loginWithCredentials,
  loginWithDemoPreset,
  logoutWebSession,
  refreshWebAuthToken,
  setAccessToken,
} from "@asc/api-client";
import { queryKeys } from "@asc/api-client/react";
import { getPublicMedplumClientId, isApiMockingEnabled } from "@asc/config/public-env";
import type { AuthSession, DemoPersonaId, LoginResult } from "@asc/types";
import type { LoginFormData } from "@asc/validation/auth";
import type { MeResponse } from "@asc/validation/authz";
import { buildUserProfileFromSession } from "../lib/auth/claims";
import { clearPendingCodeVerifier, setPendingCodeVerifier } from "../lib/auth/pkce";
import { useAuthStore } from "../lib/stores/auth.store";
import { workspacesFor } from "../lib/workspaces";

export function useDemoPresets() {
  return useQuery({ queryKey: queryKeys.auth.demoPresets, queryFn: getDemoPresets, staleTime: Infinity });
}

/** The demo persona matching the signed-in user's email, if they signed in as one. */
export function useCurrentPersona(): DemoPersonaId | null {
  const presets = useDemoPresets();
  const email = useAuthStore((state) => state.session?.user.email);
  return presets.data?.find((preset) => preset.email === email)?.id ?? null;
}

interface MedplumProfileResponse {
  readonly code?: string;
}

interface MedplumMfaVerifyResponse {
  readonly code?: string;
  readonly login?: string;
  readonly memberships?: readonly { readonly id?: string }[];
}

export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useAuthStore((state) => state.session);
  const principal = useAuthStore((state) => state.principal);
  const facilities = useAuthStore((state) => state.facilities);
  const facilityId = useAuthStore((state) => state.facilityId);
  const setSession = useAuthStore((state) => state.setSession);
  const setIdToken = useAuthStore((state) => state.setIdToken);
  const selectFacility = useAuthStore((state) => state.selectFacility);
  const clearSession = useAuthStore((state) => state.clearSession);

  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const startSession = useCallback(
    async (
      next: AuthSession,
      meResponse?: MeResponse,
      sessionStartedAt?: number,
    ) => {
      // Token stays in memory (module variable in @asc/api-client), never in browser storage.
      setAccessToken(next.token);
      try {
        // Sign-in only completes once the server has returned the principal (fail closed).
        const me = meResponse ?? (await getMe());
        setSession(next, me, sessionStartedAt);
      } catch (error) {
        setAccessToken(null);
        throw error;
      }
      // Clinical data is role-scoped: drop anything cached for the previous persona.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== queryKeys.auth.all[0] });
      const { principal: signedIn, facilityId: facility } = useAuthStore.getState();
      router.push(workspacesFor(signedIn, facility)[0]?.home ?? "/dashboard");
    },
    [queryClient, router, setSession],
  );

  const login = useCallback(
    async (credentials: LoginFormData): Promise<LoginResult> => {
      setIsLoggingIn(true);
      try {
        const medplum = getBrowserMedplumClient();
        if (medplum !== undefined) {
          const { codeVerifier, codeChallenge, codeChallengeMethod } = await generatePkceChallenge();
          setPendingCodeVerifier(codeVerifier);
          const clientId = getPublicMedplumClientId();
          const loginRes = await medplum.startLogin({
            email: credentials.email,
            password: credentials.password,
            codeChallenge,
            codeChallengeMethod,
            ...(clientId !== undefined ? { clientId } : {}),
          });

          if (loginRes.mfaRequired) {
            return {
              status: "mfa_required",
              challenge: {
                loginId: loginRes.login,
                codeVerifier,
                email: credentials.email,
              },
            };
          }

          let authCode = loginRes.code;
          if (authCode === undefined && loginRes.memberships && loginRes.memberships.length > 0) {
            const firstMembership = loginRes.memberships[0];
            const chosen = await medplum.post<MedplumProfileResponse>("auth/profile", {
              login: loginRes.login,
              profile: firstMembership?.id,
            });
            authCode = chosen.code;
          }

          if (authCode === undefined) {
            throw new Error("Medplum returned no authorization code");
          }

          const tokenResult = await exchangeWebAuthCode(authCode, codeVerifier);
          clearPendingCodeVerifier();
          medplum.setAccessToken(tokenResult.accessToken);
          if (tokenResult.idToken !== undefined) {
            setIdToken(tokenResult.idToken);
          }
          setAccessToken(tokenResult.accessToken);
          const me = await getMe();
          const user = buildUserProfileFromSession({
            me,
            idToken: tokenResult.idToken,
            emailFallback: credentials.email,
          });
          await startSession(
            {
              user,
              token: tokenResult.accessToken,
              expiresAt: new Date(Date.now() + (tokenResult.expiresIn ?? 900) * 1000).toISOString(),
            },
            me,
            tokenResult.sessionStartedAt,
          );
          return { status: "complete" };
        }

        const sessionData = await loginWithCredentials(credentials);
        await startSession(sessionData);
        return { status: "complete" };
      } finally {
        setIsLoggingIn(false);
      }
    },
    [setIdToken, startSession],
  );

  const verifyTotp = useCallback(
    async (params: {
      readonly loginId: string;
      readonly code: string;
      readonly codeVerifier: string;
      readonly email: string;
    }): Promise<void> => {
      setIsLoggingIn(true);
      try {
        const medplum = getBrowserMedplumClient();
        if (medplum === undefined) {
          throw new Error("Medplum client is not configured");
        }

        let verifyRes: MedplumMfaVerifyResponse;
        try {
          verifyRes = await medplum.post<MedplumMfaVerifyResponse>("auth/mfa/verify", {
            login: params.loginId,
            token: params.code,
          });
        } catch {
          verifyRes = await medplum.post<MedplumMfaVerifyResponse>("auth/login", {
            login: params.loginId,
            code: params.code,
          });
        }

        let authCode = verifyRes.code;
        if (authCode === undefined && verifyRes.memberships && verifyRes.memberships.length > 0) {
          const firstMembership = verifyRes.memberships[0];
          const chosen = await medplum.post<MedplumProfileResponse>("auth/profile", {
            login: verifyRes.login ?? params.loginId,
            profile: firstMembership?.id,
          });
          authCode = chosen.code;
        }

        if (authCode === undefined) {
          throw new Error("Medplum returned no authorization code after MFA verification");
        }

        const tokenResult = await exchangeWebAuthCode(authCode, params.codeVerifier);
        clearPendingCodeVerifier();
        medplum.setAccessToken(tokenResult.accessToken);
        if (tokenResult.idToken !== undefined) {
          setIdToken(tokenResult.idToken);
        }
        setAccessToken(tokenResult.accessToken);
        const me = await getMe();
        const user = buildUserProfileFromSession({
          me,
          idToken: tokenResult.idToken,
          emailFallback: params.email,
        });
        await startSession(
          {
            user,
            token: tokenResult.accessToken,
            expiresAt: new Date(Date.now() + (tokenResult.expiresIn ?? 900) * 1000).toISOString(),
          },
          me,
          tokenResult.sessionStartedAt,
        );
      } finally {
        setIsLoggingIn(false);
      }
    },
    [setIdToken, startSession],
  );

  const restoreSession = useCallback(async (): Promise<boolean> => {
    try {
      const tokens = await refreshWebAuthToken();
      if (!tokens.accessToken) return false;
      const medplum = getBrowserMedplumClient();
      if (medplum !== undefined) {
        medplum.setAccessToken(tokens.accessToken);
      }
      setAccessToken(tokens.accessToken);
      if (tokens.idToken !== undefined) {
        setIdToken(tokens.idToken);
      }
      const me = await getMe();
      const user = buildUserProfileFromSession({
        me,
        idToken: tokens.idToken,
      });
      setSession(
        {
          user,
          token: tokens.accessToken,
          expiresAt: new Date(Date.now() + (tokens.expiresIn ?? 900) * 1000).toISOString(),
        },
        me,
        tokens.sessionStartedAt,
      );
      return true;
    } catch {
      return false;
    }
  }, [setIdToken, setSession]);

  const demoLogin = useMutation({
    mutationFn: (presetId: DemoPersonaId) => {
      if (!isApiMockingEnabled()) {
        return Promise.reject(new Error("Demo accounts are unavailable when API mocking is disabled"));
      }
      return loginWithDemoPreset(presetId);
    },
    onSuccess: (sessionData) => {
      void startSession(sessionData);
    },
  });

  /** Demo persona switch = demo login as that preset. */
  const switchPersona = useCallback(
    (personaId: DemoPersonaId) => demoLogin.mutateAsync(personaId),
    [demoLogin],
  );

  const logout = useCallback(async () => {
    const medplum = getBrowserMedplumClient();
    if (medplum !== undefined) {
      try {
        await medplum.signOut();
      } catch {
        // Ignore network failure on sign out
      }
    }
    try {
      await logoutWebSession();
    } catch {
      // Ignore network failure on cookie clearing
    }
    setAccessToken(null);
    setIdToken(null);
    clearPendingCodeVerifier();
    clearSession();
    queryClient.clear();
    router.push("/login");
  }, [clearSession, queryClient, router, setIdToken]);

  return {
    user: session?.user ?? null,
    principal,
    facilities,
    facilityId,
    selectFacility,
    isAuthenticated: session !== null && principal !== null,
    login,
    verifyTotp,
    restoreSession,
    isLoggingIn,
    loginWithDemo: demoLogin.mutateAsync,
    isDemoLoggingIn: demoLogin.isPending,
    switchPersona,
    logout,
  };
}

