import { grantedFacilityIds } from "@asc/authz/can";
import type { AuthSession, Principal } from "@asc/types";
import type { MeResponse } from "@asc/validation/authz";
import { create } from "zustand";

interface AuthState {
  /** Current session, held in memory only — never persisted (no tokens or PHI in browser storage). */
  readonly session: AuthSession | null;
  /** Medplum OIDC id_token kept in memory only for step-up auth (P05h / P05j). */
  readonly idToken: string | null;
  /** Who the server says this is, with per-facility grants. UI checks use it for convenience; the API enforces. */
  readonly principal: Principal | null;
  /** Display names for the facilities the principal holds grants at. */
  readonly facilities: MeResponse["facilities"];
  /** The facility checks run against. Null for principals with only all-site grants. */
  readonly facilityId: string | null;
  /** Workspace the user picked; the effective one is resolved from capabilities (use-workspace). */
  readonly workspaceKey: string | null;
  /** Timestamp (ms) when this session was established, used for absolute 12h timeout checks. */
  readonly sessionStartedAt: number | null;
  readonly setSession: (session: AuthSession, me: MeResponse) => void;
  readonly setIdToken: (idToken: string | null) => void;
  /** Ignored unless the principal holds a grant at that facility. Resets the picked workspace. */
  readonly selectFacility: (facilityId: string) => void;
  readonly selectWorkspace: (workspaceKey: string | null) => void;
  readonly clearSession: () => void;
}

const SIGNED_OUT: Pick<AuthState, "session" | "idToken" | "principal" | "facilities" | "facilityId" | "workspaceKey" | "sessionStartedAt"> = {
  session: null,
  idToken: null,
  principal: null,
  facilities: [],
  facilityId: null,
  workspaceKey: null,
  sessionStartedAt: null,
};

export const useAuthStore = create<AuthState>()((set, get) => ({
  ...SIGNED_OUT,
  setSession: (session, me) =>
    set({
      session,
      sessionStartedAt: Date.now(),
      principal: me.principal,
      facilities: me.facilities,
      facilityId: grantedFacilityIds(me.principal)[0] ?? null,
      workspaceKey: null,
    }),
  setIdToken: (idToken) => set({ idToken }),
  selectFacility: (facilityId) => {
    const { principal } = get();
    if (principal !== null && grantedFacilityIds(principal).includes(facilityId)) set({ facilityId, workspaceKey: null });
  },
  selectWorkspace: (workspaceKey) => set({ workspaceKey }),
  clearSession: () => set(SIGNED_OUT),
}));
