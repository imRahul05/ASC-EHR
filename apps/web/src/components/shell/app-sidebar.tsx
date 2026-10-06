"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@asc/ui";
import { Activity } from "@asc/ui/icons";
import type { UserRole } from "@asc/types";
import { useAuth } from "../../hooks/use-auth";
import { useCan } from "../../hooks/use-can";
import { ROLE_LABEL, visibleNavItems } from "./nav-config";

function isActive(href: string, pathname: string, view: string | null): boolean {
  const [path, query] = href.split("?");
  if (query) return pathname === path && `view=${view ?? ""}` === query;
  if (pathname !== path && !pathname.startsWith(`${path}/`)) return false;
  return view === null || path !== "/my-care";
}

type NavItems = ReturnType<typeof visibleNavItems>;

function NavMenu({ items, withSearchParams }: { readonly items: NavItems; readonly withSearchParams: boolean }) {
  const pathname = usePathname();
  return withSearchParams ? <NavMenuWithView items={items} pathname={pathname} /> : <NavList items={items} pathname={pathname} view={null} />;
}

function NavMenuWithView({ items, pathname }: { readonly items: NavItems; readonly pathname: string }) {
  const view = useSearchParams().get("view");
  return <NavList items={items} pathname={pathname} view={view} />;
}

function NavList({ items, pathname, view }: { readonly items: NavItems; readonly pathname: string; readonly view: string | null }) {
  return (
    <SidebarMenu>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <SidebarMenuItem key={item.key}>
            <SidebarMenuButton
              render={<Link href={item.href} />}
              isActive={isActive(item.href, pathname, view)}
              tooltip={item.title}
              data-testid={`nav-${item.key}`}
              className="h-8 text-[13px] font-medium text-sidebar-foreground/80 data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground [&_svg]:text-muted-foreground data-active:[&_svg]:text-primary"
            >
              <Icon className="size-4" />
              <span>{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

/** Navigation from capabilities: each entry shows when the user can use it at the current facility. */
export function AppSidebar() {
  const { user } = useAuth();
  const can = useCan();
  const items = visibleNavItems(can);
  const role: UserRole = user?.role ?? "SURGEON";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="px-3 pt-4 pb-2">
        <Link href={role === "PATIENT" ? "/my-care" : "/dashboard"} className="flex items-center gap-2.5 rounded-lg px-1 py-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
            <Activity className="size-4" />
          </span>
          <span className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">ASC EHR</span>
            <span className="truncate text-[11px] text-muted-foreground">{user?.facilityName ?? "Metro GI Center"}</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-1">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] font-medium text-muted-foreground">{ROLE_LABEL[role].label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <Suspense fallback={<NavMenu items={items} withSearchParams={false} />}>
              <NavMenu items={items} withSearchParams />
            </Suspense>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-3">
        <div className="flex items-center gap-2 rounded-lg px-1 text-[11px] text-muted-foreground group-data-[collapsible=icon]:justify-center">
          <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden />
          <span className="group-data-[collapsible=icon]:hidden">Demo data · synthetic only</span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
