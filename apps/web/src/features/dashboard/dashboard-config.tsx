import type { DashboardSummary, StaffRole, UserProfile } from "@asc/types";
import type { StatCardProps } from "@asc/ui";
import { Activity, BedDouble, CalendarDays, ChartLine, Clock, FileSignature, ListChecks, Microscope } from "@asc/ui/icons";
import { AdrPanel } from "./adr-panel";
import { AlertsPanel } from "./alerts-panel";
import { AsaQueuePanel } from "./asa-queue-panel";
import { CenterOpsPanel } from "./center-ops-panel";
import { NurseFlowPanel } from "./nurse-flow-panel";
import { TodayCasesPanel } from "./today-cases-panel";
import { WorkItemsPanel } from "./work-items-panel";

type Stat = Omit<StatCardProps, "className" | "isLoading"> & { readonly id: string };
type Panel = (props: { readonly user: UserProfile }) => React.ReactNode;

const pct = (value: number) => `${Math.round(value * 100)} %`;

/** Reusable KPI tiles computed from the dashboard summary. */
const STAT = {
  casesToday: (s: DashboardSummary): Stat => ({ id: "cases", label: "Cases today", value: s.casesToday, icon: CalendarDays }),
  inRoom: (s: DashboardSummary): Stat => ({ id: "room", label: "In procedure", value: s.inRoom, icon: Activity }),
  inRecovery: (s: DashboardSummary): Stat => ({ id: "pacu", label: "In recovery", value: s.inRecovery, icon: BedDouble }),
  signatures: (s: DashboardSummary): Stat => ({
    id: "sign",
    label: "Notes to sign",
    value: s.pendingSignatures,
    icon: FileSignature,
    tone: s.pendingSignatures > 0 ? "warning" : "default",
  }),
  work: (s: DashboardSummary): Stat => ({ id: "work", label: "Open work items", value: s.openWorkItems, icon: ListChecks }),
  pathology: (s: DashboardSummary): Stat => ({ id: "path", label: "Specimens pending", value: s.pendingPathology, icon: Microscope }),
  onTime: (s: DashboardSummary): Stat => ({
    id: "ontime",
    label: "On-time starts",
    value: pct(s.onTimeStartRate),
    icon: Clock,
    hint: "within 5 min of booked",
    tone: s.onTimeStartRate >= 0.85 ? "success" : "warning",
  }),
  adr: (s: DashboardSummary): Stat => ({
    id: "adr",
    label: "ADR · 30 days",
    value: pct(s.adr30d),
    icon: ChartLine,
    trend: { direction: s.adr30d >= 0.3 ? "up" : "flat", label: s.adr30d >= 0.3 ? "above 30 % goal" : "below 30 % goal", positive: s.adr30d >= 0.3 },
  }),
} as const;

/** Sign-queue panel bound to its type (keeps the config a list of components). */
const SignQueuePanel: Panel = () => <WorkItemsPanel role="SURGEON" type="sign_note" title="Sign queue" />;
const roleWork = (role: StaffRole, title: string): Panel => {
  const RoleWorkPanel: Panel = () => <WorkItemsPanel role={role} title={title} />;
  return RoleWorkPanel;
};
const CenterCases: Panel = ({ user }) => <TodayCasesPanel user={user} scope="all" title="Today's cases" />;
const MySlate: Panel = ({ user }) => <TodayCasesPanel user={user} scope="mine" title="My slate today" />;
const Alerts: Panel = () => <AlertsPanel />;
const CenterOps: Panel = () => <CenterOpsPanel />;
const NurseFlow: Panel = () => <NurseFlowPanel />;
const AdminWork = roleWork("ADMIN", "My work items");
const NurseWork = roleWork("NURSE", "My work items");

/**
 * Workspace home: subtitle, KPI tiles and the panels (main column + side column), keyed by
 * workspace key (apps/web/src/lib/workspaces.ts). Data, not a switch. The test in
 * dashboard-config.test.ts fails when a workspace has no entry.
 */
export const DASHBOARDS: Readonly<
  Record<string, { readonly description: string; readonly stats: readonly ((s: DashboardSummary) => Stat)[]; readonly main: readonly Panel[]; readonly side: readonly Panel[] }>
> = {
  operations: {
    description: "Center operations, back-office queues and today's blockers.",
    stats: [STAT.casesToday, STAT.onTime, STAT.signatures, STAT.work],
    main: [CenterOps, CenterCases],
    side: [AdminWork, Alerts],
  },
  physician: {
    description: "Your slate, notes waiting for your signature and your quality numbers.",
    stats: [STAT.casesToday, STAT.signatures, STAT.pathology, STAT.adr],
    main: [MySlate, AdrPanel],
    side: [SignQueuePanel, Alerts],
  },
  nursing: {
    description: "Who is where, and the next thing each patient needs.",
    stats: [STAT.casesToday, STAT.inRoom, STAT.inRecovery, STAT.work],
    main: [NurseFlow, CenterCases],
    side: [NurseWork, Alerts],
  },
  anesthesia: {
    description: "Upcoming sedation cases by risk, and who is in the room now.",
    stats: [STAT.casesToday, STAT.inRoom, STAT.inRecovery, STAT.onTime],
    main: [AsaQueuePanel, CenterCases],
    side: [Alerts],
  },
};
