"use client";

import { useTheme } from "next-themes";
import {
  Moon,
  Sun,
  LogOut,
  ChevronDown,
  Stethoscope,
  ShieldAlert,
  HeartPulse,
  Building2,
  UserCircle,
  Bell,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SidebarTrigger,
} from "@asc/ui";
import type { UserRole } from "@asc/types";
import { useAuth } from "../../hooks/use-auth";

const ROLE_ICONS: Record<UserRole, typeof Stethoscope> = {
  SURGEON: Stethoscope,
  ANESTHESIOLOGIST: ShieldAlert,
  NURSE: HeartPulse,
  ADMIN: Building2,
  PATIENT: UserCircle,
};

const ROLES_LIST: readonly { role: UserRole; label: string; desc: string }[] = [
  { role: "SURGEON", label: "Proceduralist (Surgeon)", desc: "Endoscopy schedule & reports" },
  { role: "ANESTHESIOLOGIST", label: "Anesthesiologist", desc: "Airway & sedation clearance" },
  { role: "NURSE", label: "Clinical Nurse (PACU)", desc: "Intake & whiteboard flow" },
  { role: "ADMIN", label: "Center Administrator", desc: "OR utilization & audit" },
  { role: "PATIENT", label: "Patient Portal", desc: "Bowel prep & arrival tracker" },
] as const;

export function DashboardHeader() {
  const { user, switchRole, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const activeRole: UserRole = user?.role ?? "SURGEON";
  const RoleIcon = ROLE_ICONS[activeRole];

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/80 bg-background/95 px-4 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-xs font-semibold tracking-tight text-foreground">
            {user?.facilityName ?? "Metro GI Surgery Center"}
          </span>
          <span className="text-muted-foreground/60">•</span>
          <span className="text-xs text-muted-foreground">OR Suite 1 & 2 Active</span>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        {/* Role Quick-Switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs border-border/80 hover:border-foreground/40 font-medium"
              >
                <RoleIcon className="h-3.5 w-3.5 text-foreground" />
                <span className="hidden md:inline text-muted-foreground">Active Role:</span>
                <span className="font-semibold text-foreground">{activeRole}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground ml-0.5" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              Instant Persona Switcher (Demo Mode)
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ROLES_LIST.map((item) => {
              const ItemIcon = ROLE_ICONS[item.role];
              const isCurrent = item.role === activeRole;
              return (
                <DropdownMenuItem
                  key={item.role}
                  onClick={() => switchRole(item.role)}
                  className={`flex items-start gap-2.5 cursor-pointer py-2 ${
                    isCurrent ? "bg-accent font-medium" : ""
                  }`}
                >
                  <ItemIcon className="h-4 w-4 mt-0.5 text-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-foreground">{item.label}</span>
                      {isCurrent && (
                        <Badge variant="secondary" className="text-[9px] px-1 py-0">
                          Active
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications mock pill */}
        <Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-foreground">
          <Bell className="h-3.5 w-3.5" />
        </Button>

        {/* Dark/Light mode toggle */}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Toggle theme"
        >
          <Sun className="h-3.5 w-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        {/* User Profile Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm" className="h-8 gap-2 px-1.5 hover:bg-accent">
                <Avatar className="h-6 w-6 border border-border">
                  <AvatarFallback className="text-[10px] font-bold bg-foreground text-background">
                    {user?.initials ?? "US"}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden lg:flex flex-col text-left">
                  <span className="text-xs font-semibold leading-none text-foreground">
                    {user?.fullName ?? "Clinician"}
                  </span>
                  <span className="text-[10px] text-muted-foreground leading-none mt-0.5">
                    {user?.roleTitle ?? activeRole}
                  </span>
                </div>
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-xs font-medium leading-none text-foreground">{user?.fullName}</p>
                <p className="text-[11px] leading-none text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logout()} className="text-destructive cursor-pointer">
              <LogOut className="h-3.5 w-3.5 mr-2" />
              Sign Out Workstation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
