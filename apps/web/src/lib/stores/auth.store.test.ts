import type { AuthSession } from "@asc/types";
import type { MeResponse } from "@asc/validation/authz";
import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "./auth.store";

const session: AuthSession = {
  token: "t",
  expiresAt: "2099-01-01T00:00:00.000Z",
  user: { id: "u1", email: "u@x.dev", fullName: "U One", roleTitle: "RN", initials: "UO", facilityName: "A" },
};

const me: MeResponse = {
  principal: {
    kind: "staff",
    id: "u1",
    membershipId: "m1",
    tenant: { tenantId: "t1", medplumProjectId: "p1" },
    grants: [
      { scope: "facility", facilityId: "A", roleKeys: ["rn"], capabilities: ["case.read"] },
      { scope: "facility", facilityId: "B", roleKeys: ["gi-physician"], capabilities: ["note.sign"] },
    ],
  },
  facilities: [
    { id: "A", name: "Facility A" },
    { id: "B", name: "Facility B" },
  ],
};

beforeEach(() => useAuthStore.getState().clearSession());

describe("auth store", () => {
  it("starts signed out with no principal or facility", () => {
    expect(useAuthStore.getState()).toMatchObject({ session: null, principal: null, facilities: [], facilityId: null });
  });

  it("keeps the principal and picks the first granted facility", () => {
    useAuthStore.getState().setSession(session, me);
    expect(useAuthStore.getState()).toMatchObject({ facilityId: "A", principal: { id: "u1" } });
    expect(useAuthStore.getState().facilities).toHaveLength(2);
  });

  it("switches facility only to one the principal has a grant at", () => {
    useAuthStore.getState().setSession(session, me);
    useAuthStore.getState().selectFacility("B");
    expect(useAuthStore.getState().facilityId).toBe("B");
    useAuthStore.getState().selectFacility("C");
    expect(useAuthStore.getState().facilityId).toBe("B");
  });

  it("remembers a picked workspace and forgets it when the facility changes or on sign-out", () => {
    useAuthStore.getState().setSession(session, me);
    useAuthStore.getState().selectWorkspace("physician");
    expect(useAuthStore.getState().workspaceKey).toBe("physician");
    useAuthStore.getState().selectFacility("B");
    expect(useAuthStore.getState().workspaceKey).toBeNull();
    useAuthStore.getState().selectWorkspace("nursing");
    useAuthStore.getState().clearSession();
    expect(useAuthStore.getState().workspaceKey).toBeNull();
  });

  it("has no current facility for an all-site principal, and ignores selection when signed out", () => {
    useAuthStore.getState().selectFacility("A");
    expect(useAuthStore.getState().facilityId).toBeNull();
    const admin: MeResponse = {
      principal: { ...me.principal, grants: [{ scope: "all", roleKeys: ["admin"], capabilities: ["admin.users"] }] },
      facilities: [],
    };
    useAuthStore.getState().setSession(session, admin);
    expect(useAuthStore.getState().facilityId).toBeNull();
  });

  it("clears everything on sign-out", () => {
    useAuthStore.getState().setSession(session, me);
    useAuthStore.getState().clearSession();
    expect(useAuthStore.getState()).toMatchObject({ session: null, principal: null, facilityId: null });
  });
});
