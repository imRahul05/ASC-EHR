"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { LoginCredentials, SignupPayload, UserRole } from "@asc/types";
import { loginWithCredentials, loginWithDemoPreset, registerUser } from "../lib/api/auth.api";
import { useAuthStore } from "../lib/stores/auth.store";

export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, setSession, switchRole, logout } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: (credentials: LoginCredentials) => loginWithCredentials(credentials),
    onSuccess: (session) => {
      setSession(session);
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      router.push("/dashboard");
    },
  });

  const demoLoginMutation = useMutation({
    mutationFn: (presetId: string) => loginWithDemoPreset(presetId),
    onSuccess: (session) => {
      setSession(session);
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      router.push("/dashboard");
    },
  });

  const signupMutation = useMutation({
    mutationFn: (payload: SignupPayload) => registerUser(payload),
    onSuccess: (session) => {
      setSession(session);
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      router.push("/dashboard");
    },
  });

  const handleRoleSwitch = (newRole: UserRole) => {
    switchRole(newRole);
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return {
    user,
    isAuthenticated,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
    loginWithDemo: demoLoginMutation.mutateAsync,
    isDemoLoggingIn: demoLoginMutation.isPending,
    signup: signupMutation.mutateAsync,
    isSigningUp: signupMutation.isPending,
    signupError: signupMutation.error,
    switchRole: handleRoleSwitch,
    logout: handleLogout,
  };
}
