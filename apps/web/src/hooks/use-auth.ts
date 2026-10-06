"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  getDemoPresets,
  getMe,
  loginWithCredentials,
  loginWithDemoPreset,
  setAccessToken,
} from "@asc/api-client";
import { queryKeys } from "@asc/api-client/react";
import type { AuthSession, DemoPersonaId } from "@asc/types";
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

export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useAuthStore((state) => state.session);
  const principal = useAuthStore((state) => state.principal);
  const facilities = useAuthStore((state) => state.facilities);
  const facilityId = useAuthStore((state) => state.facilityId);
  const setSession = useAuthStore((state) => state.setSession);
  const selectFacility = useAuthStore((state) => state.selectFacility);
  const clearSession = useAuthStore((state) => state.clearSession);

  const startSession = async (next: AuthSession) => {
    // Token stays in memory (module variable in @asc/api-client), never in browser storage.
    setAccessToken(next.token);
    try {
      // Sign-in only completes once the server has returned the principal (fail closed).
      setSession(next, await getMe());
    } catch (error) {
      setAccessToken(null);
      throw error;
    }
    // Clinical data is role-scoped: drop anything cached for the previous persona.
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== queryKeys.auth.all[0] });
    const { principal: signedIn, facilityId: facility } = useAuthStore.getState();
    router.push(workspacesFor(signedIn, facility)[0]?.home ?? "/dashboard");
  };

  const login = useMutation({ mutationFn: loginWithCredentials, onSuccess: startSession });
  const demoLogin = useMutation({ mutationFn: loginWithDemoPreset, onSuccess: startSession });

  /** Demo persona switch = demo login as that preset. */
  const switchPersona = (personaId: DemoPersonaId) => demoLogin.mutateAsync(personaId);

  const logout = () => {
    setAccessToken(null);
    clearSession();
    queryClient.clear();
    router.push("/login");
  };

  return {
    user: session?.user ?? null,
    principal,
    facilities,
    facilityId,
    selectFacility,
    isAuthenticated: session !== null && principal !== null,
    login: login.mutateAsync,
    isLoggingIn: login.isPending,
    loginWithDemo: demoLogin.mutateAsync,
    isDemoLoggingIn: demoLogin.isPending,
    switchPersona,
    logout,
  };
}
