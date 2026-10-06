import { grantedFacilityIds } from "@asc/authz/can";
import { describe, expect, it } from "vitest";
import { meFor } from "@/mocks/handlers/me";
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
    expect(keys("surgeon@ascehr.demo")).toEqual(["physician"]);
    expect(keys("nurse@ascehr.demo")).toEqual(["nursing"]);
    expect(keys("anesthesia@ascehr.demo")).toEqual(["anesthesia", "nursing"]);
    expect(keys("admin@ascehr.demo")).toEqual(["operations"]);
    expect(keys("patient@ascehr.demo")).toEqual(["patient"]);
  });

  it("change with the facility for the float user", () => {
    expect(keys("float@ascehr.demo", "fac-metro")).toEqual(["nursing"]);
    expect(keys("float@ascehr.demo", "fac-lakeside")).toEqual(["physician"]);
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
