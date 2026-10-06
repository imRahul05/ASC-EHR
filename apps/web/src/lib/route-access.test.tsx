import { grantedFacilityIds } from "@asc/authz/can";
import type { Principal } from "@asc/types";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RouteGuard } from "@/components/auth/route-guard";
import { checkCapability } from "@/hooks/use-can";
import type * as UseCanModule from "@/hooks/use-can";
import { meFor } from "@/mocks/handlers/me";
import { accessForPath, ROUTE_ACCESS } from "./route-access";

// Signed-in state and URL the guard sees. useCan is the real check, bound to this principal and facility.
const current = vi.hoisted(() => ({ principal: null as Principal | null, facilityId: null as string | null, pathname: "/" }));

vi.mock("next/navigation", () => ({ usePathname: () => current.pathname }));
vi.mock("@/hooks/use-can", async () => {
  const actual = await vi.importActual<typeof UseCanModule>("@/hooks/use-can");
  return {
    ...actual,
    useCan: () => (capability: Parameters<typeof actual.checkCapability>[2], context?: object) =>
      actual.checkCapability(current.principal, current.facilityId, capability, context),
  };
});

const PERSONAS = {
  surgeon: ["surgeon@ascehr.demo", undefined],
  anesthesia: ["anesthesia@ascehr.demo", undefined],
  nurse: ["nurse@ascehr.demo", undefined],
  admin: ["admin@ascehr.demo", undefined],
  patient: ["patient@ascehr.demo", undefined],
  floatAtMetro: ["float@ascehr.demo", "fac-metro"],
  floatAtLakeside: ["float@ascehr.demo", "fac-lakeside"],
} as const;

type Persona = keyof typeof PERSONAS;

function signInAs(persona: Persona) {
  const [email, facilityId] = PERSONAS[persona];
  const me = meFor(email);
  if (me === undefined) throw new Error(`no demo user ${email}`);
  current.principal = me.principal;
  current.facilityId = facilityId ?? grantedFacilityIds(me.principal)[0] ?? null;
}

const STAFF: Persona[] = ["surgeon", "anesthesia", "nurse", "admin", "floatAtMetro", "floatAtLakeside"];

/** Who may open each screen, written out so a change is a reviewed diff. */
const ALLOWED: Readonly<Record<keyof typeof ROUTE_ACCESS, readonly Persona[]>> = {
  dashboard: STAFF,
  schedule: STAFF,
  patients: STAFF,
  referrals: ["surgeon", "nurse", "admin", "floatAtMetro", "floatAtLakeside"],
  whiteboard: STAFF,
  cases: STAFF,
  worklist: STAFF,
  pathology: ["surgeon", "nurse", "floatAtMetro", "floatAtLakeside"],
  coding: ["surgeon", "admin", "floatAtLakeside"],
  quality: ["surgeon", "admin", "floatAtLakeside"],
  audit: ["admin"],
  admin: ["admin"],
  "my-care": ["patient"],
  guide: [...STAFF, "patient"],
};

const ROUTES = Object.keys(ROUTE_ACCESS) as (keyof typeof ROUTE_ACCESS)[];
const PERSONA_NAMES = Object.keys(PERSONAS) as Persona[];

function render(pathname: string) {
  current.pathname = pathname;
  return renderToStaticMarkup(
    <RouteGuard>
      <p>the screen</p>
    </RouteGuard>,
  );
}

describe("route table", () => {
  const appDir = join(__dirname, "../app/(dashboard)");
  const folders = readdirSync(appDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(appDir, entry.name)))
    .map((entry) => entry.name);

  it("has an entry for every signed-in route folder, and no stale entries", () => {
    const withPages = folders.filter((name) => readdirSync(join(appDir, name), { recursive: true }).some((file) => String(file).endsWith("page.tsx")));
    expect([...withPages].sort()).toEqual([...ROUTES].sort());
  });

  it("denies a path whose first segment is not in the table", () => {
    expect(accessForPath("/not-a-screen")).toBeUndefined();
    expect(accessForPath("/toString")).toBeUndefined();
    expect(accessForPath("/cases/case_104")).toEqual(ROUTE_ACCESS.cases);
    expect(accessForPath("/guide")).toBeNull();
  });
});

describe.each(ROUTES)("/%s", (route) => {
  it.each(PERSONA_NAMES)("renders for %s only if their capabilities open it", (persona) => {
    signInAs(persona);
    const html = render(`/${route}`);
    const expected = ALLOWED[route].includes(persona);
    expect(html.includes("the screen"), `${persona} at /${route}`).toBe(expected);
    expect(html.includes('data-testid="forbidden-state"')).toBe(!expected);
  });

  it("matches the capability check used by the sidebar", () => {
    for (const persona of PERSONA_NAMES) {
      signInAs(persona);
      const required = ROUTE_ACCESS[route];
      const open = required === null || checkCapability(current.principal, current.facilityId, required);
      expect(open, `${persona} at /${route}`).toBe(ALLOWED[route].includes(persona));
    }
  });
});

describe("RouteGuard", () => {
  it("shows a 403 for a route missing from the table, even to an administrator", () => {
    signInAs("admin");
    expect(render("/not-a-screen")).toContain('data-status="403"');
  });

  it("follows the facility: the float user may open quality at Lakeside but not at Metro", () => {
    signInAs("floatAtMetro");
    expect(render("/quality")).toContain("forbidden-state");
    signInAs("floatAtLakeside");
    expect(render("/quality")).toContain("the screen");
  });
});
