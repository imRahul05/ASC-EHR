import { grantedFacilityIds } from "@asc/authz/can";
import { describe, expect, it } from "vitest";
import { checkCapability } from "@/hooks/use-can";
import { DASHBOARDS } from "@/features/dashboard/dashboard-config";
import { meFor } from "@/mocks/handlers/me";
import { ROUTE_ACCESS } from "./route-access";
import { WORKSPACES, workspacesFor } from "./workspaces";

function keys(email: string, facilityId?: string): string[] {
  const me = meFor(email);
  if (me === undefined) throw new Error(`no demo user ${email}`);
  const current = facilityId ?? grantedFacilityIds(me.principal)[0] ?? null;
  return workspacesFor(me.principal, current).map((workspace) => workspace.key);
}

describe("workspaces", () => {
  it("have unique keys", () => {
    const all = WORKSPACES.map((workspace) => workspace.key);
    expect(new Set(all).size).toBe(all.length);
  });

  it("resolve per demo persona, first match being the default", () => {
    // Whoever holds the tech capabilities may also open the tech workspace (a nurse's are a superset).
    expect(keys("surgeon@ascehr.demo")).toEqual(["physician", "tech"]);
    expect(keys("nurse@ascehr.demo")).toEqual(["nursing", "tech"]);
    expect(keys("anesthesia@ascehr.demo")).toEqual(["anesthesia", "nursing"]);
    expect(keys("admin@ascehr.demo")).toEqual(["operations"]);
    expect(keys("patient@ascehr.demo")).toEqual(["patient"]);
  });

  it("change with the facility for the float user", () => {
    expect(keys("float@ascehr.demo", "fac-metro")).toEqual(["nursing", "tech"]);
    expect(keys("float@ascehr.demo", "fac-lakeside")).toEqual(["physician", "tech"]);
  });

  it("are empty without a principal, or without a current facility for facility-scoped roles", () => {
    expect(workspacesFor(null, "fac-metro")).toEqual([]);
    const nurse = meFor("nurse@ascehr.demo")?.principal ?? null;
    expect(workspacesFor(nurse, null)).toEqual([]);
  });

  it("send the patient workspace to the portal and every other one to the dashboard", () => {
    for (const workspace of WORKSPACES) {
      expect(workspace.home).toBe(workspace.key === "patient" ? "/my-care" : "/dashboard");
    }
  });
});

// A new role is data: the tech role template already existed, so a tech user needed only an
// identity (users + role assignment) and a workspace with its dashboard config. No logic changed.
describe("a tech added by configuration alone", () => {
  const tech = meFor("tech@ascehr.demo");

  it("signs in with the tech role at Metro and lands in the tech workspace", () => {
    expect(tech?.principal.grants.flatMap((grant) => grant.roleKeys)).toEqual(["tech"]);
    expect(keys("tech@ascehr.demo")).toEqual(["tech"]);
    expect(WORKSPACES.find((workspace) => workspace.key === "tech")?.home).toBe("/dashboard");
    expect(DASHBOARDS.tech).toBeDefined();
  });

  it("may open the room screens and nothing administrative or clinical-review", () => {
    const opens = (route: keyof typeof ROUTE_ACCESS) => {
      const required = ROUTE_ACCESS[route];
      return required === null || checkCapability(tech?.principal ?? null, "fac-metro", required);
    };
    for (const route of ["dashboard", "whiteboard", "schedule", "patients", "cases", "guide"] as const) {
      expect(opens(route), route).toBe(true);
    }
    for (const route of ["worklist", "referrals", "pathology", "coding", "quality", "audit", "admin", "my-care"] as const) {
      expect(opens(route), route).toBe(false);
    }
  });
});
