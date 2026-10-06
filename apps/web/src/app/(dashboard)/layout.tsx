"use client";

import { SidebarInset, SidebarProvider } from "@asc/ui/components/ui/sidebar";
import { RequireAuth } from "@/components/auth/require-auth";
import { RouteGuard } from "@/components/auth/route-guard";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { GuideLayer } from "@/features/guide/guide-layer";
import { MockProvider } from "@/mocks/mock-provider";

interface DashboardLayoutProps {
  readonly children: React.ReactNode;
}

/** Signed-in shell: role nav, top bar (⌘K, help, persona switcher, theme, user menu), page area, onboarding layer. */
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <MockProvider>
      <RequireAuth>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="min-w-0 bg-background">
            <TopBar />
            <div className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-20 sm:px-6 lg:px-8">
              <RouteGuard>{children}</RouteGuard>
            </div>
          </SidebarInset>
          <GuideLayer />
        </SidebarProvider>
      </RequireAuth>
    </MockProvider>
  );
}
