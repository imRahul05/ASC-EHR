"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDashboardSummary } from "@asc/api-client/react";
import { formatWeekday } from "@asc/clinical-rules/time";
import type { UserProfile } from "@asc/types";
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader, StatCard } from "@asc/ui";
import { ShieldAlert } from "@asc/ui/icons";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { DASHBOARDS } from "./dashboard-config";

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

/** `/dashboard` — the home of the user's current workspace (config per workspace in DASHBOARDS). */
export function WorkspaceDashboard() {
  const { user } = useAuth();
  const { current } = useWorkspace();
  if (!user) return <LoadingSkeleton variant="page" />;
  if (current === null) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="No workspace for your access here"
        description="Your roles at this facility don't open a workspace yet. Ask an administrator."
      />
    );
  }
  if (current.home !== "/dashboard") return <GoHome href={current.home} />;
  const config = DASHBOARDS[current.key];
  if (config === undefined) {
    return <EmptyState icon={ShieldAlert} title="This workspace has no dashboard yet" description="Ask an administrator." />;
  }
  return <StaffDashboard user={user} workspaceKey={current.key} config={config} />;
}

function GoHome({ href }: { readonly href: string }) {
  const router = useRouter();
  useEffect(() => router.replace(href), [router, href]);
  return <LoadingSkeleton variant="page" />;
}

function StaffDashboard({
  user,
  workspaceKey,
  config,
}: {
  readonly user: UserProfile;
  readonly workspaceKey: string;
  readonly config: (typeof DASHBOARDS)[string];
}) {
  const summary = useDashboardSummary();
  const hour = new Date().getHours();
  const greeting = GREETINGS.find((item) => hour < item.before)?.text ?? "Hello";

  return (
    <div className="space-y-6" data-testid="dashboard" data-workspace={workspaceKey}>
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
