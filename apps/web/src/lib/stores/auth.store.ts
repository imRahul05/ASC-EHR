import { setFacilityId } from "@asc/api-client";
import { clearAimsQueue } from "@asc/api-client/offline/queue";
import type { AuthSession, Principal } from "@asc/types";
import type { MeResponse } from "@asc/validation/authz";
import { create } from "zustand";

export function resolveActiveFacility(
  facilities: readonly { readonly id: string; readonly name: string }[],
  persistedId?: string | null,
  defaultFacilityId?: string | null
): string | null {
  const validIds = facilities.map((f) => f.id);
  // 1. Validated persisted / last-used facility (if still valid for this user)
  if (persistedId && validIds.includes(persistedId)) return persistedId;
  // 2. Server-specified default facility from /me
  if (defaultFacilityId && validIds.includes(defaultFacilityId)) return defaultFacilityId;
  // 3. Single facility (Day 1) or primary index
  return validIds[0] ?? null;
}

interface AuthState {
  /** Current session, held in memory only — never persisted (no tokens or PHI in browser storage). */
  readonly session: AuthSession | null;
  /** Medplum OIDC id_token kept in memory only for step-up auth (P05h / P05j). */
  readonly idToken: string | null;
  /** Who the server says this is, with per-facility grants. UI checks use it for convenience; the API enforces. */
  readonly principal: Principal | null;
  /** Accessible work locations from me.facilities (grants define capabilities; me.facilities defines locations). */
  readonly facilities: MeResponse["facilities"];
  /** The facility checks run against. Resolved from me.facilities. */
  readonly facilityId: string | null;
  /** Workspace the user picked; the effective one is resolved from capabilities (use-workspace). */
  readonly workspaceKey: string | null;
  /** Timestamp (ms) when this session was established, used for absolute 12h timeout checks. */
  readonly sessionStartedAt: number | null;
  readonly setSession: (session: AuthSession, me: MeResponse, sessionStartedAt?: number) => void;
  readonly setIdToken: (idToken: string | null) => void;
  /** Ignored unless the facility is in me.facilities. Resets the picked workspace. */
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
  setSession: (session, me, sessionStartedAt) => {
    const facilityId = resolveActiveFacility(me.facilities, get().facilityId);
    setFacilityId(facilityId);
    set({
      session,
      sessionStartedAt: sessionStartedAt ?? get().sessionStartedAt ?? Date.now(),
      principal: me.principal,
      facilities: me.facilities,
      facilityId,
      workspaceKey: null,
    });
  },
  setIdToken: (idToken) => set({ idToken }),
  selectFacility: (facilityId) => {
    if (get().facilityId !== facilityId && get().facilities.some((f) => f.id === facilityId)) {
      setFacilityId(facilityId);
      set({ facilityId, workspaceKey: null });
    }
  },
  selectWorkspace: (workspaceKey) => set({ workspaceKey }),
  clearSession: () => {
    void clearAimsQueue().catch(() => {});
    setFacilityId(null);
    set(SIGNED_OUT);
  },
}));
