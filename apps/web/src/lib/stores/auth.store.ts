import { create } from "zustand";
import type { AuthSession } from "@asc/types";

interface AuthState {
  /** Current session, held in memory only — never persisted (no tokens or PHI in browser storage). */
  readonly session: AuthSession | null;
  readonly setSession: (session: AuthSession) => void;
  readonly clearSession: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  session: null,
  setSession: (session) => set({ session }),
  clearSession: () => set({ session: null }),
}));
