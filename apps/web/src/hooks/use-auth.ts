"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { getDemoPresets, loginWithCredentials, loginWithDemoPreset, registerUser } from "@asc/api-client";
import type { AuthSession, UserRole } from "@asc/types";
import { useAuthStore } from "../lib/stores/auth.store";

const DEMO_PRESETS_KEY = ["auth", "demo-presets"] as const;

export function useDemoPresets() {
  return useQuery({ queryKey: DEMO_PRESETS_KEY, queryFn: getDemoPresets, staleTime: Infinity });
}

export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useAuthStore((state) => state.session);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);

  const startSession = (next: AuthSession) => {
    setSession(next);
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    router.push("/dashboard");
  };

  const login = useMutation({ mutationFn: loginWithCredentials, onSuccess: startSession });
  const demoLogin = useMutation({ mutationFn: loginWithDemoPreset, onSuccess: startSession });
  const signup = useMutation({ mutationFn: registerUser, onSuccess: startSession });

  /** Demo persona switch = demo login as the preset for that role. */
  const switchRole = async (role: UserRole) => {
    const presets = await queryClient.ensureQueryData({ queryKey: DEMO_PRESETS_KEY, queryFn: getDemoPresets });
    const preset = presets.find((item) => item.role === role);
    if (preset) await demoLogin.mutateAsync(preset.id);
  };

  const logout = () => {
    clearSession();
    queryClient.clear();
    router.push("/login");
  };

  return {
    user: session?.user ?? null,
    isAuthenticated: session !== null,
    login: login.mutateAsync,
    isLoggingIn: login.isPending,
    loginWithDemo: demoLogin.mutateAsync,
    isDemoLoggingIn: demoLogin.isPending,
    signup: signup.mutateAsync,
    isSigningUp: signup.isPending,
    switchRole,
    logout,
  };
}
