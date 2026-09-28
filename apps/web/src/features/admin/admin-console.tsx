"use client";

import { useState } from "react";
import { useAdminOverview } from "@asc/api-client/react";
import type { AdminOverview } from "@asc/types";
import { DataTable, ErrorState, LoadingSkeleton, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@asc/ui";
import { Bot, CalendarRange, DoorOpen, UsersRound, type LucideIcon } from "@asc/ui/icons";
import { AGENT_COLUMNS, blockColumns, ROOM_COLUMNS, STAFF_COLUMNS } from "./admin-columns";

type TabId = "roster" | "rooms" | "blocks" | "agents";

/** Tabs as data: label, icon, and how to render from the overview. */
const TABS: readonly { readonly id: TabId; readonly label: string; readonly icon: LucideIcon; readonly note: string; readonly render: (data: AdminOverview) => React.ReactNode }[] = [
  {
    id: "roster",
    label: "Staff roster",
    icon: UsersRound,
    note: "Credentialed staff and their system roles. NPI shown for billing providers.",
    render: (data) => <DataTable columns={STAFF_COLUMNS} rows={data.staff} getRowId={(row) => row.id} data-testid="admin-roster" />,
  },
  {
    id: "rooms",
    label: "Rooms",
    icon: DoorOpen,
    note: "Procedure rooms and their live status.",
    render: (data) => <DataTable columns={ROOM_COLUMNS} rows={data.rooms} getRowId={(row) => row.id} data-testid="admin-rooms" />,
  },
  {
    id: "blocks",
    label: "Block templates",
    icon: CalendarRange,
    note: "Weekly room blocks per surgeon (drives the schedule grid and utilization).",
    render: (data) => (
      <DataTable
        columns={blockColumns(data)}
        rows={[...data.blocks].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.roomId.localeCompare(b.roomId))}
        getRowId={(row) => row.id}
        data-testid="admin-blocks"
      />
    ),
  },
  {
    id: "agents",
    label: "AI agents",
    icon: Bot,
    note: "Read-only. Models and prompts are changed in @asc/agents config and reviewed like code.",
    render: (data) => <DataTable columns={AGENT_COLUMNS} rows={data.agents} getRowId={(row) => row.agent} data-testid="admin-agents" />,
  },
];

/** `/admin` — roster (NPI, roles), rooms, block templates, AI agents (read-only). */
export function AdminConsole() {
  const [tab, setTab] = useState<TabId>("roster");
  const overview = useAdminOverview();

  return (
    <div className="space-y-6" data-testid="admin-console">
      <PageHeader title="Admin" description="Center configuration. Changes here are audited." />
      <Tabs value={tab} onValueChange={(value) => setTab(value as TabId)} className="gap-4">
        <TabsList variant="line" className="h-auto! w-full flex-wrap justify-start border-b border-border pb-px" aria-label="Admin sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id} className="flex-none px-2.5" data-testid={`admin-tab-${id}`}>
              <Icon /> {label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((item) => (
          <TabsContent key={item.id} value={item.id} className="space-y-3">
            <p className="text-sm text-muted-foreground">{item.note}</p>
            {overview.isPending && <LoadingSkeleton variant="table" />}
            {overview.isError && <ErrorState message="Could not load admin data." onRetry={() => void overview.refetch()} />}
            {overview.isSuccess && item.render(overview.data)}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
