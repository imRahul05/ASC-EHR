import { grantedFacilityIds } from "@asc/authz/can";
import type { Principal } from "@asc/types";
import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RequireCapability } from "@/components/auth/require-capability";
import { checkCapability } from "@/hooks/use-can";
import type * as UseCanModule from "@/hooks/use-can";
import { ROUTE_ACCESS } from "@/lib/route-access";
import { meFor } from "@/mocks/handlers/me";
import AdminPage from "./admin/page";
import AuditPage from "./audit/page";
import CodingPage from "./coding/page";
import QualityPage from "./quality/page";

// Signed-in state the guard sees. useCan is the real check, bound to this principal and facility.
const current = vi.hoisted(() => ({ principal: null as Principal | null, facilityId: null as string | null }));

vi.mock("@/hooks/use-can", async () => {
  const actual = await vi.importActual<typeof UseCanModule>("@/hooks/use-can");
  return {
    ...actual,
    useCan: () => (capability: Parameters<typeof actual.checkCapability>[2], context?: object) =>
      actual.checkCapability(current.principal, current.facilityId, capability, context),
  };
});

function signInAs(email: string, facilityId?: string) {
  const me = meFor(email);
  if (me === undefined) throw new Error(`no demo user ${email}`);
  current.principal = me.principal;
  current.facilityId = facilityId ?? grantedFacilityIds(me.principal)[0] ?? null;
}

const PERSONAS = {
  surgeon: () => signInAs("surgeon@ascehr.demo"),
  anesthesia: () => signInAs("anesthesia@ascehr.demo"),
  nurse: () => signInAs("nurse@ascehr.demo"),
  admin: () => signInAs("admin@ascehr.demo"),
  patient: () => signInAs("patient@ascehr.demo"),
  floatAtMetro: () => signInAs("float@ascehr.demo", "fac-metro"),
  floatAtLakeside: () => signInAs("float@ascehr.demo", "fac-lakeside"),
} as const;

type Persona = keyof typeof PERSONAS;
const EVERYONE = Object.keys(PERSONAS) as Persona[];

const GUARDED = [
  { route: "admin", Page: AdminPage, allowed: ["admin"] },
  { route: "audit", Page: AuditPage, allowed: ["admin"] },
  { route: "coding", Page: CodingPage, allowed: ["surgeon", "admin", "floatAtLakeside"] },
  { route: "quality", Page: QualityPage, allowed: ["surgeon", "admin", "floatAtLakeside"] },
] as const;

describe.each(GUARDED)("/$route is guarded", ({ route, Page, allowed }) => {
  it("wraps the screen in RequireCapability with the capabilities declared for the route", () => {
    const element = Page();
    expect(isValidElement(element)).toBe(true);
    expect(element.type).toBe(RequireCapability);
    expect(element.props).toMatchObject({ capability: ROUTE_ACCESS[route] });
  });

  it.each(EVERYONE.filter((persona) => !(allowed as readonly Persona[]).includes(persona)))(
    "shows 403 to %s",
    (persona) => {
      PERSONAS[persona]();
      const html = renderToStaticMarkup(Page());
      expect(html).toContain('data-testid="forbidden-state"');
    },
  );

  it.each(allowed)("lets %s through", (persona) => {
    PERSONAS[persona]();
    expect(checkCapability(current.principal, current.facilityId, ROUTE_ACCESS[route])).toBe(true);
  });
});

describe("switching facility changes access", () => {
  it("shows the float user the quality screen at Lakeside but a 403 at Metro", () => {
    PERSONAS.floatAtMetro();
    expect(renderToStaticMarkup(QualityPage())).toContain("forbidden-state");
    PERSONAS.floatAtLakeside();
    expect(checkCapability(current.principal, current.facilityId, ROUTE_ACCESS.quality)).toBe(true);
  });
});
