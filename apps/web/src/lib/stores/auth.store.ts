import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AuthSession, UserProfile, UserRole } from "@asc/types";
import { MOCK_USER_PROFILES } from "../mock/data/users.mock";

interface AuthState {
  readonly user: UserProfile | null;
  readonly token: string | null;
  readonly isAuthenticated: boolean;
  readonly setSession: (session: AuthSession) => void;
  readonly switchRole: (role: UserRole) => void;
  readonly logout: () => void;
}

const ROLE_EMAIL_MAP: Record<UserRole, string> = {
  SURGEON: "surgeon@ascehr.demo",
  ANESTHESIOLOGIST: "anesthesia@ascehr.demo",
  NURSE: "nurse@ascehr.demo",
  ADMIN: "admin@ascehr.demo",
  PATIENT: "patient@ascehr.demo",
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: MOCK_USER_PROFILES["surgeon@ascehr.demo"] ?? null,
      token: "demo_token_initial",
      isAuthenticated: true,

      setSession: (session: AuthSession) => {
        set({
          user: session.user,
          token: session.token,
          isAuthenticated: true,
        });
      },

      switchRole: (role: UserRole) => {
        const targetEmail = ROLE_EMAIL_MAP[role];
        const profile = MOCK_USER_PROFILES[targetEmail];
        if (profile) {
          set({
            user: profile,
            token: `mock_switched_token_${profile.id}`,
            isAuthenticated: true,
          });
        }
      },

      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: "asc-ehr-auth-session",
      storage: createJSONStorage(() => (typeof window !== "undefined" ? window.localStorage : {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      })),
    }
  )
);
