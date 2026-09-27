"use client";

import { SidebarInset, SidebarProvider } from "@asc/ui";
import { RequireAuth } from "../../components/auth/require-auth";
import { AppSidebar } from "../../components/dashboard/app-sidebar";
import { DashboardHeader } from "../../components/dashboard/dashboard-header";

interface DashboardLayoutProps {
  readonly children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <RequireAuth>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <DashboardHeader />
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </RequireAuth>
  );
}
