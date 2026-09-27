"use client";

import { usePathname } from "next/navigation";
import { useResetDemo } from "@asc/api-client/react";
import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Separator,
  SidebarTrigger,
  ThemeToggle,
  toast,
} from "@asc/ui";
import { Check, ChevronDown, ChevronRight, LogOut, RotateCcw } from "@asc/ui/icons";
import type { UserRole } from "@asc/types";
import { useAuth } from "../../hooks/use-auth";
import { CommandMenu } from "./command-menu";
import { ROLE_LABEL, routeTitle } from "./nav-config";

const ROLES = Object.keys(ROLE_LABEL) as UserRole[];

function RoleSwitcher({ role, onSwitch }: { readonly role: UserRole; readonly onSwitch: (role: UserRole) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs font-medium" data-testid="role-switcher">
            <span className="hidden text-muted-foreground md:inline">Viewing as</span>
            {ROLE_LABEL[role].label}
            <ChevronDown className="size-3 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={8} className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Switch demo persona</DropdownMenuLabel>
          {ROLES.map((item) => (
            <DropdownMenuItem key={item} onClick={() => onSwitch(item)} className="items-start gap-2 py-2" data-testid={`role-option-${item}`}>
              <Check className={item === role ? "mt-0.5 size-3.5 text-primary" : "mt-0.5 size-3.5 opacity-0"} />
              <span className="flex flex-col">
                <span className="text-xs font-medium">{ROLE_LABEL[item].label}</span>
                <span className="text-[11px] text-muted-foreground">{ROLE_LABEL[item].description}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Sticky top bar: sidebar toggle, breadcrumb, ⌘K, persona switcher, theme, user menu. */
export function TopBar() {
  const pathname = usePathname();
  const { user, switchRole, logout } = useAuth();
  const resetDemo = useResetDemo();
  const role: UserRole = user?.role ?? "SURGEON";
  const title = routeTitle(pathname);

  const onReset = () =>
    resetDemo.mutate(undefined, {
      onSuccess: () => toast.success("Demo data reset", { description: "All demo records were re-seeded." }),
      onError: () => toast.error("Could not reset demo data"),
    });

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/80 px-3 backdrop-blur-md sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="text-muted-foreground" />
        <Separator orientation="vertical" className="mx-1 h-4" />
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className="hidden truncate text-muted-foreground sm:inline">{user?.facilityName ?? "Metro GI Center"}</span>
          {title && <ChevronRight aria-hidden className="hidden size-3.5 text-muted-foreground/60 sm:inline" />}
          {title && <span className="truncate font-medium text-foreground">{title}</span>}
        </nav>
      </div>

      <div className="flex items-center gap-1.5">
        <CommandMenu />
        <RoleSwitcher role={role} onSwitch={(next) => void switchRole(next)} />
        <ThemeToggle className="size-8" />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="User menu" data-testid="user-menu">
                <Avatar className="size-7">
                  <AvatarFallback className="bg-accent text-[11px] font-semibold text-accent-foreground">{user?.initials ?? "US"}</AvatarFallback>
                </Avatar>
              </Button>
            }
          />
          <DropdownMenuContent align="end" sideOffset={8} className="w-60">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-medium text-foreground">{user?.fullName}</p>
                <p className="text-xs text-muted-foreground">{user?.roleTitle}</p>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onReset} disabled={resetDemo.isPending} data-testid="reset-demo">
              <RotateCcw className="size-3.5" />
              Reset demo data
            </DropdownMenuItem>
            <DropdownMenuItem onClick={logout} variant="destructive" data-testid="logout">
              <LogOut className="size-3.5" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
