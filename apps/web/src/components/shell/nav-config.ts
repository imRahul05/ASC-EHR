import {
  CalendarDays,
  ChartLine,
  ClipboardList,
  FileHeart,
  HeartHandshake,
  Inbox,
  LifeBuoy,
  LayoutDashboard,
  ListChecks,
  Microscope,
  MonitorDot,
  Receipt,
  ScrollText,
  Settings2,
  Stethoscope,
  UsersRound,
  type LucideIcon,
} from "@asc/ui/icons";
import type { Capability, UserRole } from "@asc/types";
import { ROUTE_ACCESS } from "@/lib/route-access";

/** Every signed-in screen (docs/product/07-mock-frontend.md §4). Keys are the first path segment. */
const ROUTES = {
  dashboard: { href: "/dashboard", title: "Dashboard", icon: LayoutDashboard },
  schedule: { href: "/schedule", title: "Schedule", icon: CalendarDays },
  patients: { href: "/patients", title: "Patients", icon: UsersRound },
  referrals: { href: "/referrals", title: "Referrals", icon: Inbox },
  whiteboard: { href: "/whiteboard", title: "Whiteboard", icon: MonitorDot },
  cases: { href: "/schedule", title: "Case", icon: Stethoscope },
  worklist: { href: "/worklist", title: "Worklist", icon: ListChecks },
  pathology: { href: "/pathology", title: "Pathology", icon: Microscope },
  coding: { href: "/coding", title: "Coding", icon: Receipt },
  quality: { href: "/quality", title: "Quality", icon: ChartLine },
  audit: { href: "/audit", title: "Audit log", icon: ScrollText },
  admin: { href: "/admin", title: "Admin", icon: Settings2 },
  "my-care": { href: "/my-care", title: "My procedure", icon: HeartHandshake },
  guide: { href: "/guide", title: "Help center", icon: LifeBuoy },
} as const satisfies Record<string, { href: string; title: string; icon: LucideIcon }>;

type RouteKey = keyof typeof ROUTES;

interface NavItem {
  readonly key: string;
  readonly href: string;
  readonly title: string;
  readonly icon: LucideIcon;
  /** Shown when the user holds any of these capabilities; null = every signed-in user. */
  readonly requiresAny: readonly Capability[] | null;
}

const nav = (key: RouteKey, title?: string): NavItem => ({
  key,
  ...ROUTES[key],
  title: title ?? ROUTES[key].title,
  requiresAny: ROUTE_ACCESS[key],
});

const PORTAL: readonly Capability[] = ["portal.self.read"];

/** Every sidebar entry in display order. Each declares the capability that shows it. */
const NAV_ITEMS: readonly NavItem[] = [
  nav("dashboard"),
  nav("whiteboard"),
  nav("schedule"),
  nav("patients"),
  nav("referrals"),
  nav("worklist"),
  nav("pathology"),
  nav("coding"),
  nav("quality"),
  nav("audit"),
  nav("admin"),
  nav("my-care"),
  { key: "my-care-prep", href: "/my-care?view=prep", title: "Prep", icon: ClipboardList, requiresAny: PORTAL },
  { key: "my-care-escort", href: "/my-care?view=escort", title: "Escort", icon: UsersRound, requiresAny: PORTAL },
  { key: "my-care-results", href: "/my-care?view=results", title: "Results & instructions", icon: FileHeart, requiresAny: PORTAL },
  nav("guide"),
];

/** Sidebar and command-menu entries for what the user can do at the current facility. */
export function visibleNavItems(can: (capability: readonly Capability[]) => boolean) {
  return NAV_ITEMS.filter((item) => item.requiresAny === null || can(item.requiresAny));
}

/**
 * Sidebar per role. Superseded by NAV_ITEMS + visibleNavItems; only the help sheet still
 * reads it, and P05d2 removes it with UserRole.
 */
export const NAV_BY_ROLE: Readonly<Record<UserRole, readonly NavItem[]>> = {
  ADMIN: [
    nav("dashboard"),
    nav("schedule"),
    nav("patients"),
    nav("referrals"),
    nav("worklist"),
    nav("coding"),
    nav("quality"),
    nav("audit"),
    nav("admin"),
    nav("guide"),
  ],
  NURSE: [nav("dashboard"), nav("whiteboard"), nav("schedule"), nav("patients"), nav("worklist"), nav("guide")],
  SURGEON: [
    nav("dashboard"),
    nav("schedule"),
    nav("patients"),
    nav("worklist", "Sign queue"),
    nav("pathology"),
    nav("quality"),
    nav("guide"),
  ],
  ANESTHESIOLOGIST: [nav("dashboard"), nav("whiteboard"), nav("schedule"), nav("patients"), nav("guide")],
  PATIENT: [
    nav("my-care"),
    { key: "my-care-prep", href: "/my-care?view=prep", title: "Prep", icon: ClipboardList, requiresAny: PORTAL },
    { key: "my-care-escort", href: "/my-care?view=escort", title: "Escort", icon: UsersRound, requiresAny: PORTAL },
    { key: "my-care-results", href: "/my-care?view=results", title: "Results & instructions", icon: FileHeart, requiresAny: PORTAL },
    nav("guide"),
  ],
};

/** Page title for the top bar breadcrumb, from the first path segment. */
export function routeTitle(pathname: string): string {
  const segment = pathname.split("/")[1] ?? "";
  return segment in ROUTES ? ROUTES[segment as RouteKey].title : "";
}

/** Role labels for the demo persona switcher. */
export const ROLE_LABEL: Readonly<Record<UserRole, { readonly label: string; readonly description: string }>> = {
  ADMIN: { label: "Front desk & admin", description: "Scheduling, referrals, coding, audit" },
  NURSE: { label: "Nurse", description: "Pre-op, procedure room, PACU" },
  SURGEON: { label: "Gastroenterologist", description: "Slate, notes, pathology" },
  ANESTHESIOLOGIST: { label: "Anesthesia", description: "Sedation and airway" },
  PATIENT: { label: "Patient", description: "Portal: prep, escort, results" },
};
