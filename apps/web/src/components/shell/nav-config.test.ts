import { grantedFacilityIds } from "@asc/authz/can";
import { describe, expect, it } from "vitest";
import { checkCapability } from "@/hooks/use-can";
import { meFor } from "@/mocks/handlers/me";
import { visibleNavItems } from "./nav-config";

function navKeys(email: string, facilityId?: string): string[] {
  const me = meFor(email);
  if (me === undefined) throw new Error(`no demo user ${email}`);
  const current = facilityId ?? grantedFacilityIds(me.principal)[0] ?? null;
  return visibleNavItems((capability) => checkCapability(me.principal, current, capability)).map((item) => item.key);
}

describe("sidebar from capabilities", () => {
  it("shows a nurse the floor screens and nothing administrative", () => {
    expect(navKeys("nurse@ascehr.demo")).toEqual([
      "dashboard",
      "whiteboard",
      "schedule",
      "patients",
      "referrals",
      "worklist",
      "pathology",
      "guide",
    ]);
  });

  it("shows a physician coding, quality and pathology but not audit or admin", () => {
    expect(navKeys("surgeon@ascehr.demo")).toEqual([
      "dashboard",
      "whiteboard",
      "schedule",
      "patients",
      "referrals",
      "worklist",
      "pathology",
      "coding",
      "quality",
      "guide",
    ]);
  });

  it("shows anesthesia the whiteboard and worklist but no referrals, pathology or coding", () => {
    expect(navKeys("anesthesia@ascehr.demo")).toEqual(["dashboard", "whiteboard", "schedule", "patients", "worklist", "guide"]);
  });

  it("shows the multi-role admin persona front desk, coding, quality, audit and admin", () => {
    expect(navKeys("admin@ascehr.demo")).toEqual([
      "dashboard",
      "whiteboard",
      "schedule",
      "patients",
      "referrals",
      "worklist",
      "coding",
      "quality",
      "audit",
      "admin",
      "guide",
    ]);
  });

  it("shows a patient only the portal and help", () => {
    expect(navKeys("patient@ascehr.demo")).toEqual(["my-care", "my-care-prep", "my-care-escort", "my-care-results", "guide"]);
  });

  it("changes when the float user switches facility", () => {
    expect(navKeys("float@ascehr.demo", "fac-metro")).toEqual(navKeys("nurse@ascehr.demo"));
    expect(navKeys("float@ascehr.demo", "fac-lakeside")).toEqual(navKeys("surgeon@ascehr.demo"));
    expect(navKeys("float@ascehr.demo", "fac-lakeside")).toContain("quality");
    expect(navKeys("float@ascehr.demo", "fac-metro")).not.toContain("quality");
  });

  it("shows nothing but help to a facility-scoped user with no current facility", () => {
    const me = meFor("nurse@ascehr.demo");
    const items = visibleNavItems((capability) => checkCapability(me?.principal ?? null, null, capability));
    expect(items.map((item) => item.key)).toEqual(["guide"]);
  });
});
