"use client";

import { SidebarInset, SidebarProvider } from "@asc/ui";
import { AppSidebar } from "../../components/dashboard/app-sidebar";
import { DashboardHeader } from "../../components/dashboard/dashboard-header";

interface DashboardLayoutProps {
  readonly children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-col flex-1 min-w-0">
          <DashboardHeader />
          <main className="flex-1 p-4 sm:p-6 overflow-y-auto">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
