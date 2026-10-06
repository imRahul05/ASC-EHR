import { describe, expect, it } from "vitest";
import { grantedFacilityIds } from "@asc/authz/can";
import { DEMO_PRESETS } from "@/mocks/data/users";
import { meFor } from "@/mocks/handlers/me";
import { PERSONAS } from "./personas";
import { roleLabelsFor, roleLabelsWith } from "./role-labels";
import { workspacesFor } from "./workspaces";
import { ROUTE_ACCESS } from "./route-access";

const principalOf = (email: string) => meFor(email)?.principal ?? null;

describe("role labels from templates", () => {
  it("lists the roles held at the current facility", () => {
    const float = principalOf("float@ascehr.demo");
    expect(roleLabelsFor(float, "fac-metro")).toEqual(["Registered nurse"]);
    expect(roleLabelsFor(float, "fac-lakeside")).toEqual(["GI physician"]);
  });

  it("includes all-site roles next to the facility role", () => {
    expect(roleLabelsFor(principalOf("admin@ascehr.demo"), "fac-metro")).toEqual([
      "Administrator",
      "Medical coder",
      "Auditor",
      "Front desk",
    ]);
  });

  it("is empty without a principal, and shows only all-site roles without a facility", () => {
    expect(roleLabelsFor(null, "fac-metro")).toEqual([]);
    expect(roleLabelsFor(principalOf("nurse@ascehr.demo"), null)).toEqual([]);
    expect(roleLabelsFor(principalOf("admin@ascehr.demo"), null)).toEqual(["Administrator", "Medical coder", "Auditor"]);
  });

  it("names the roles whose templates open a screen, or every role when any user may", () => {
    expect(roleLabelsWith(ROUTE_ACCESS.audit)).toEqual(["Administrator", "Auditor"]);
    expect(roleLabelsWith(ROUTE_ACCESS.guide)).toHaveLength(9);
  });
});

describe("personas", () => {
  it("cover exactly the demo presets", () => {
    expect(Object.keys(PERSONAS).sort()).toEqual(DEMO_PRESETS.map((preset) => preset.id).sort());
  });

  it("land on the home of the workspace their capabilities open", () => {
    const email = (id: string) => DEMO_PRESETS.find((preset) => preset.id === id)?.email ?? "";
    for (const [id, persona] of Object.entries(PERSONAS)) {
      const principal = principalOf(email(id));
      const facility = principal === null ? null : (grantedFacilityIds(principal)[0] ?? null);
      expect(workspacesFor(principal, facility)[0]?.home, id).toBe(persona.home);
    }
  });

  it("have a unique display order", () => {
    const orders = Object.values(PERSONAS).map((persona) => persona.order);
    expect(new Set(orders).size).toBe(orders.length);
  });
});
