"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDashboardSummary } from "@asc/api-client/react";
import { formatWeekday } from "@asc/clinical-rules/time";
import type { StaffRole, UserProfile } from "@asc/types";
import { ErrorState, LoadingSkeleton, PageHeader, StatCard } from "@asc/ui";
import { useAuth } from "@/hooks/use-auth";
import { DASHBOARD_BY_ROLE } from "./dashboard-config";

/** Greeting by local hour: first bound the hour is below wins. */
const GREETINGS: readonly { readonly before: number; readonly text: string }[] = [
  { before: 12, text: "Good morning" },
  { before: 18, text: "Good afternoon" },
  { before: 24, text: "Good evening" },
];

/** "Dr. Arthur Vance" → "Dr. Vance"; "Sarah Jenkins, RN" → "Sarah". */
function firstName(fullName: string): string {
  const parts = fullName.replace(/,.*$/, "").trim().split(/\s+/);
  return parts[0] === "Dr." ? `Dr. ${parts.at(-1) ?? ""}` : (parts[0] ?? fullName);
}

/** `/dashboard` — the role's home (config per role in DASHBOARD_BY_ROLE). Patients go to the portal. */
export function RoleDashboard() {
  const { user } = useAuth();
  if (!user) return <LoadingSkeleton variant="page" />;
  if (user.role === "PATIENT") return <PortalRedirect />;
  return <StaffDashboard user={user} role={user.role} />;
}

function PortalRedirect() {
  const router = useRouter();
  useEffect(() => router.replace("/my-care"), [router]);
  return <LoadingSkeleton variant="page" />;
}

function StaffDashboard({ user, role }: { readonly user: UserProfile; readonly role: StaffRole }) {
  const summary = useDashboardSummary();
  const config = DASHBOARD_BY_ROLE[role];
  const hour = new Date().getHours();
  const greeting = GREETINGS.find((item) => hour < item.before)?.text ?? "Hello";

  return (
    <div className="space-y-6" data-testid="dashboard" data-role={role}>
      <PageHeader eyebrow={formatWeekday(new Date().toISOString())} title={`${greeting}, ${firstName(user.fullName)}`} description={config.description} />
      {summary.isError ? (
        <ErrorState message="Could not load today's numbers." onRetry={() => void summary.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="dashboard-stats">
          {config.stats.map((stat, index) =>
            summary.data ? (
              <StatCard key={stat(summary.data).id} {...stat(summary.data)} />
            ) : (
              <StatCard key={index} label="Loading" value="–" isLoading />
            ),
          )}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          {config.main.map((Panel, index) => (
            <Panel key={index} user={user} />
          ))}
        </div>
        <div className="min-w-0 space-y-4">
          {config.side.map((Panel, index) => (
            <Panel key={index} user={user} />
          ))}
        </div>
      </div>
    </div>
  );
}
