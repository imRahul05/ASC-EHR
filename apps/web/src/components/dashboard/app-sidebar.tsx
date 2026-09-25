"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  LayoutDashboard,
  Calendar,
  FileText,
  Microscope,
  ShieldCheck,
  ClipboardCheck,
  Users,
  History,
  FileCheck2,
  Clock,
  HeartPulse,
} from "lucide-react";
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
  Badge,
} from "@asc/ui";
import type { UserRole } from "@asc/types";
import { useAuth } from "../../hooks/use-auth";

interface NavItem {
  readonly title: string;
  readonly href: string;
  readonly icon: typeof LayoutDashboard;
  readonly badge?: string;
}

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const role: UserRole = user?.role ?? "SURGEON";

  const getRoleNavItems = (): readonly NavItem[] => {
    switch (role) {
      case "SURGEON":
        return [
          { title: "Procedure Slate", href: "/dashboard", icon: Calendar, badge: "Today" },
          { title: "Endoscopy Report Writer", href: "/dashboard/reports", icon: FileText, badge: "AI Ready" },
          { title: "Pathology & Specimens", href: "/dashboard/pathology", icon: Microscope },
          { title: "GI Quality KPIs (ADR)", href: "/dashboard/quality", icon: ShieldCheck },
        ];
      case "ANESTHESIOLOGIST":
        return [
          { title: "Anesthesia Queue", href: "/dashboard", icon: Calendar, badge: "Active" },
          { title: "Airway / ASA Scoring", href: "/dashboard/airway", icon: ClipboardCheck },
          { title: "Sedation & Vitals Log", href: "/dashboard/sedation", icon: HeartPulse },
          { title: "PACU Recovery Clearance", href: "/dashboard/recovery", icon: FileCheck2 },
        ];
      case "NURSE":
        return [
          { title: "Digital Whiteboard", href: "/dashboard", icon: LayoutDashboard, badge: "Live" },
          { title: "Pre-Op Patient Intake", href: "/dashboard/intake", icon: ClipboardCheck },
          { title: "Time-Out Verification", href: "/dashboard/timeout", icon: ShieldCheck },
          { title: "Aldrete Recovery Scores", href: "/dashboard/aldrete", icon: Clock },
        ];
      case "ADMIN":
        return [
          { title: "Center Operations", href: "/dashboard", icon: LayoutDashboard },
          { title: "OR Block Scheduling", href: "/dashboard/scheduling", icon: Calendar },
          { title: "Biller Charge Hand-Off", href: "/dashboard/billing", icon: FileCheck2, badge: "Pending" },
          { title: "HIPAA Audit Logs", href: "/dashboard/audit", icon: History },
          { title: "Staff Roster & NPIs", href: "/dashboard/roster", icon: Users },
        ];
      case "PATIENT":
        return [
          { title: "My Procedure Hub", href: "/dashboard", icon: LayoutDashboard },
          { title: "Bowel Prep Checklist", href: "/dashboard/prep", icon: ClipboardCheck, badge: "Required" },
          { title: "Escort & Ride Details", href: "/dashboard/escort", icon: Users },
          { title: "Discharge Guidance", href: "/dashboard/discharge", icon: FileText },
        ];
    }
  };

  const navItems = getRoleNavItems();

  return (
    <Sidebar collapsible="icon" className="border-r border-border/80 bg-sidebar">
      <SidebarHeader className="border-b border-border/70 p-4">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-foreground text-background shrink-0">
            <Activity className="h-4 w-4" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight text-sidebar-foreground">
                ASC EHR
              </span>
              <span className="text-[9px] font-mono uppercase bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                GI Suite
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">Metro GI Center</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3 space-y-4">
        {/* Role Workspace Label */}
        <SidebarGroup>
          <div className="px-2 pb-2 group-data-[collapsible=icon]:hidden">
            <Badge
              variant="outline"
              className="w-full justify-center text-[10px] uppercase font-mono py-1 tracking-wider bg-background/50"
            >
              {role} WORKSPACE
            </Badge>
          </div>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Clinical Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={isActive}
                      tooltip={item.title}
                      className="text-xs font-medium h-8 flex items-center justify-between w-full"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" />
                        <span>{item.title}</span>
                      </div>
                      {item.badge && (
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-normal">
                          {item.badge}
                        </Badge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border/70 p-3">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1 group-data-[collapsible=icon]:justify-center">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">System Live</span>
          </span>
          <span className="font-mono text-[10px] group-data-[collapsible=icon]:hidden">v0.1.0</span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
