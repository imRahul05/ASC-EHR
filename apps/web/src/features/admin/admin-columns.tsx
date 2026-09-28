import type { AdminOverview, AgentSetting, BlockTemplate, Room, StaffMember } from "@asc/types";
import { Badge, type DataTableColumn } from "@asc/ui";
import { ShieldCheck } from "@asc/ui/icons";

const ROLE_LABEL: Readonly<Record<StaffMember["role"], string>> = {
  ADMIN: "Admin",
  SURGEON: "Surgeon",
  NURSE: "Nurse",
  ANESTHESIOLOGIST: "Anesthesia",
};
const ROOM_STATUS: Readonly<Record<Room["status"], string>> = { idle: "Idle", in_use: "In use", turnover: "Turnover", blocked: "Blocked" };
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export const STAFF_COLUMNS: readonly DataTableColumn<StaffMember>[] = [
  {
    id: "name",
    header: "Name",
    cell: (row) => (
      <div>
        <p className="text-sm font-medium">{row.name}</p>
        <p className="text-xs text-muted-foreground">{row.email}</p>
      </div>
    ),
  },
  { id: "title", header: "Title", cell: (row) => row.title },
  { id: "role", header: "System role", cell: (row) => <Badge variant="secondary">{ROLE_LABEL[row.role]}</Badge> },
  { id: "npi", header: "NPI", cell: (row) => <span className="font-mono text-xs">{row.npi ?? "—"}</span> },
  { id: "active", header: "Status", cell: (row) => <Badge variant="outline" className={row.active ? "text-success" : "text-muted-foreground"}>{row.active ? "Active" : "Inactive"}</Badge> },
];

export const ROOM_COLUMNS: readonly DataTableColumn<Room>[] = [
  { id: "name", header: "Room", cell: (row) => <span className="font-medium">{row.name}</span> },
  { id: "id", header: "Id", cell: (row) => <span className="font-mono text-xs text-muted-foreground">{row.id}</span> },
  { id: "status", header: "Status", cell: (row) => <Badge variant="outline">{ROOM_STATUS[row.status]}</Badge> },
];

export function blockColumns(data: AdminOverview): readonly DataTableColumn<BlockTemplate>[] {
  const surgeon = new Map(data.staff.map((member) => [member.id, member.name]));
  const room = new Map(data.rooms.map((item) => [item.id, item.name]));
  return [
    { id: "day", header: "Day", cell: (row) => WEEKDAY[row.dayOfWeek] ?? row.dayOfWeek },
    { id: "room", header: "Room", cell: (row) => room.get(row.roomId) ?? row.roomId },
    { id: "time", header: "Time", cell: (row) => <span className="tabular-nums">{row.start}–{row.end}</span> },
    { id: "surgeon", header: "Surgeon", cell: (row) => surgeon.get(row.surgeonId) ?? row.surgeonId },
  ];
}

export const AGENT_COLUMNS: readonly DataTableColumn<AgentSetting>[] = [
  {
    id: "agent",
    header: "Agent",
    className: "min-w-56 whitespace-normal",
    cell: (row) => (
      <div>
        <p className="text-sm font-medium">{row.label}</p>
        <p className="text-xs text-muted-foreground">{row.description}</p>
      </div>
    ),
  },
  { id: "model", header: "Model", cell: (row) => <span className="text-sm">{row.model}</span> },
  { id: "prompt", header: "Prompt version", cell: (row) => <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.promptVersion}</code> },
  {
    id: "phi",
    header: "Contains PHI",
    cell: (row) =>
      (row.containsPhi ?? true) ? (
        <Badge variant="outline" className="border-warning/30 text-warning">
          <ShieldCheck /> PHI · BAA only
        </Badge>
      ) : (
        <Badge variant="outline">No PHI</Badge>
      ),
  },
  { id: "enabled", header: "Status", cell: (row) => <Badge variant="outline" className={row.enabled ? "text-success" : "text-muted-foreground"}>{row.enabled ? "Enabled" : "Disabled"}</Badge> },
];
