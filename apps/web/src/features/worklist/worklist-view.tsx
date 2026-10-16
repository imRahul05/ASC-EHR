"use client";

/**
 * Unified Clinical & Administrative Worklist View (Phase P12)
 *
 * Implements role and capability-governed work queues across ASC pre-op, intra-op,
 * and post-discharge lifecycles backed by FHIR Task resources.
 *
 * US Healthcare Regulatory Citations:
 * - CMS 42 CFR § 416.52: Conditions for Coverage - Comprehensive medical history and
 *   physical assessment (H&P) validity windows (30 days) and pre-procedure readiness verification.
 * - No Surprises Act 45 CFR § 149.610: Statutory delivery deadlines for Good Faith Estimates (GFE)
 *   and timely financial clearance for self-pay and uninsured patients.
 * - HIPAA 45 CFR § 164.312(b): Audit controls, technical access mechanisms, and capability tracking
 *   for clinical task claiming and completion.
 */

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@asc/api-client";
import { useClaimWorkItem, useCompleteWorkItem, useWorklist } from "@asc/api-client/react";
import {
  isWorkItemOverdue,
  sortWorkItemsForQueue,
  WORK_ITEM_QUEUE_MAP,
} from "@asc/clinical-rules";
import { formatDateTime } from "@asc/clinical-rules/time";
import type { ParticipantRole, WorkItem, WorkItemType } from "@asc/types";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageHeader,
  SegmentedControl,
  Tabs,
  TabsList,
  TabsTrigger,
  toast,
  useNow,
  type DataTableColumn,
} from "@asc/ui";
import { AlarmClock, Check, CheckCircle2, ListChecks, UserCheck } from "@asc/ui/icons";
import { useCan } from "@/hooks/use-can";
import { WORK_ITEM_TYPE_LABEL, workItemHref } from "./work-item-links";

type TabId = WorkItemType | "all";
type StatusFilter = WorkItem["status"];
type QueueId =
  | "all"
  | "nursing"
  | "financial"
  | "physician"
  | "front_desk"
  | "coding"
  | "pathology";

const QUEUE_PILLS: readonly { readonly id: QueueId; readonly label: string }[] = [
  { id: "all", label: "All Queues" },
  { id: "nursing", label: "Nursing" },
  { id: "financial", label: "Financial" },
  { id: "physician", label: "Physician" },
  { id: "front_desk", label: "Front Desk" },
  { id: "coding", label: "Coding" },
  { id: "pathology", label: "Pathology" },
];

const TABS: readonly TabId[] = [
  "all",
  "sign_note",
  "eligibility_failed",
  "referral_intake",
  "pending_pathology",
  "coding",
  "result_letter",
  "med_hold_review",
  "prep_instructions",
  "preop_call",
  "anesthesia_review",
  "final_confirmation",
  "hp_expiring",
];

const ROLE_LABEL: Readonly<Record<ParticipantRole, string>> = {
  ADMIN: "Front desk / coder",
  SURGEON: "Surgeon",
  NURSE: "Nurse",
  ANESTHESIOLOGIST: "Anesthesia",
};

const PRIORITY_CLASS: Readonly<Record<WorkItem["priority"], string>> = {
  stat: "border-destructive/40 bg-destructive/15 text-destructive font-semibold",
  urgent: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium",
  routine: "border-muted-foreground/30 bg-muted/40 text-muted-foreground",
  high: "border-destructive/30 bg-destructive/8 text-destructive",
  normal: "text-muted-foreground",
  low: "text-muted-foreground",
};

const TIMELINE_BADGE_STYLE: Readonly<Record<string, string>> = {
  "T-14d": "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  "T-7d": "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  "T-3d": "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  "T-2d": "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  "T-1d": "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  "T-0": "border-destructive/40 bg-destructive/15 text-destructive font-semibold",
};

const STATUS_OPTIONS: readonly { readonly value: StatusFilter; readonly label: string }[] = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
];

const isTab = (value: string | null): value is TabId => TABS.some((tab) => tab === value);
const isQueue = (value: string | null): value is QueueId =>
  QUEUE_PILLS.some((pill) => pill.id === value);

/** `/worklist` — Unified queue view with timeline milestones, priority SLA, and atomic claiming. */
export function WorklistView() {
  return (
    <Suspense fallback={<LoadingSkeleton variant="table" />}>
      <WorklistContent />
    </Suspense>
  );
}

function WorklistContent() {
  const can = useCan();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const requestedQueue = params.get("queue");
  const queue: QueueId = isQueue(requestedQueue) ? requestedQueue : "all";

  const requested = params.get("type");
  // Whoever drafts notes (physicians) lands on their sign queue when no filter specified; everyone else on all work.
  const tab: TabId = isTab(requested)
    ? requested
    : requested === null && requestedQueue === null && can("note.draft")
      ? "sign_note"
      : "all";
  const status: StatusFilter = params.get("status") === "done" ? "done" : "open";

  const list = useWorklist({ status });
  const claim = useClaimWorkItem();
  const complete = useCompleteWorkItem();
  const all = list.data ?? [];

  const setParam = (key: "type" | "status" | "queue", value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const onClaim = (item: WorkItem) =>
    claim.mutate(item.id, {
      onSuccess: () => toast.success(`Claimed task: ${item.title}`),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not claim task"),
    });

  const onComplete = (item: WorkItem) =>
    complete.mutate(item.id, {
      onSuccess: () => toast.success("Marked task completed"),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not complete task"),
    });

  const now = useNow();
  const nowIso = new Date(now).toISOString();

  // Filter rows by selected queue and type tab
  const filtered = all.filter((item) => {
    if (queue !== "all") {
      const itemQueue = WORK_ITEM_QUEUE_MAP[item.type]?.queue;
      if (itemQueue !== queue) return false;
    }
    if (tab !== "all" && item.type !== tab) {
      return false;
    }
    return true;
  });

  // Sort: overdue first, then priority rank (stat > urgent > routine), then earliest due date
  const rows = sortWorkItemsForQueue(filtered, nowIso);

  const columns: readonly DataTableColumn<WorkItem>[] = [
    {
      id: "task",
      header: "Task",
      className: "min-w-64 whitespace-normal",
      cell: (item) => (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-medium leading-none">{item.title}</p>
            {item.timelineMilestone && (
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ${TIMELINE_BADGE_STYLE[item.timelineMilestone] ?? ""}`}
                data-testid={`milestone-badge-${item.id}`}
              >
                {item.timelineMilestone}
              </Badge>
            )}
            {item.createdByAgent && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                AI: {item.agentName ?? "Agent"}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{item.detail}</p>
        </div>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: (item) => (
        <Badge variant="secondary">{WORK_ITEM_TYPE_LABEL[item.type] ?? item.type}</Badge>
      ),
    },
    {
      id: "queue",
      header: "Queue",
      cell: (item) => {
        const itemQueue = WORK_ITEM_QUEUE_MAP[item.type]?.queue ?? "general";
        return (
          <span className="capitalize text-xs font-medium text-muted-foreground">
            {itemQueue.replace("_", " ")}
          </span>
        );
      },
    },
    {
      id: "assignee",
      header: "Assignee / Owner",
      cell: (item) => {
        if (item.status === "claimed") {
          return (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
              <UserCheck className="size-3.5" />
              {item.ownerId ?? "Claimed"}
            </span>
          );
        }
        return (
          <span className="text-sm">
            {item.ownerRole ? ROLE_LABEL[item.ownerRole] : (item.ownerCapability ?? "—")}
          </span>
        );
      },
    },
    {
      id: "priority",
      header: "Priority",
      cell: (item) => (
        <Badge variant="outline" className={PRIORITY_CLASS[item.priority]}>
          {item.priority}
        </Badge>
      ),
    },
    {
      id: "due",
      header: "Due",
      cell: (item) => {
        const overdue = isWorkItemOverdue(item, nowIso);
        return (
          <span
            className={
              overdue
                ? "inline-flex items-center gap-1 text-sm font-semibold text-destructive tabular-nums"
                : "text-sm tabular-nums"
            }
          >
            {overdue && <AlarmClock className="size-3.5 text-destructive" aria-label="Overdue" />}
            {formatDateTime(item.dueAt)}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (item) => {
        const isCompleted = item.status === "completed" || item.status === "done";
        return (
          <div className="flex justify-end items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              render={<Link href={workItemHref(item)} />}
              nativeButton={false}
              data-testid={`worklist-open-${item.id}`}
            >
              Open
            </Button>
            {!isCompleted && item.status === "open" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onClaim(item)}
                disabled={claim.isPending}
                data-testid={`worklist-claim-${item.id}`}
                className="text-xs"
              >
                Claim
              </Button>
            )}
            {!isCompleted && (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Mark "${item.title}" done`}
                onClick={() => onComplete(item)}
                disabled={complete.isPending}
                data-testid={`worklist-done-${item.id}`}
              >
                <Check className="size-4" />
              </Button>
            )}
            {isCompleted && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground pr-2">
                <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                Done
              </span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6" data-testid="worklist">
      <PageHeader
        title="Worklist"
        description="Unified FHIR Task work queues — sorted by priority, timeline SLA, and due time."
        actions={
          <SegmentedControl
            aria-label="Status"
            size="sm"
            className="w-40"
            options={STATUS_OPTIONS}
            value={status}
            onValueChange={(value) => setParam("status", value)}
            data-testid="worklist-status"
          />
        }
      />

      {/* Departmental & Role-based Queue Pills */}
      <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Work Queues">
        {QUEUE_PILLS.map((q) => {
          const active = queue === q.id;
          const count =
            q.id === "all"
              ? all.length
              : all.filter((item) => WORK_ITEM_QUEUE_MAP[item.type]?.queue === q.id).length;
          return (
            <Button
              key={q.id}
              size="sm"
              variant={active ? "default" : "outline"}
              onClick={() => setParam("queue", q.id)}
              className="h-7 rounded-full px-3 text-xs font-medium"
              data-testid={`worklist-queue-${q.id}`}
            >
              {q.label}
              <span
                className={`ml-1.5 rounded-full px-1.5 text-[10px] tabular-nums ${
                  active
                    ? "bg-primary-foreground/25 text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {count}
              </span>
            </Button>
          );
        })}
      </div>

      {/* Task Type Tabs */}
      <Tabs value={tab} onValueChange={(value) => setParam("type", String(value))}>
        <TabsList
          variant="line"
          className="h-auto! w-full flex-wrap justify-start border-b border-border pb-px"
          aria-label="Task types"
        >
          {TABS.map((id) => {
            const count =
              id === "all"
                ? (queue === "all"
                    ? all.length
                    : all.filter((item) => WORK_ITEM_QUEUE_MAP[item.type]?.queue === queue).length)
                : all.filter(
                    (item) =>
                      item.type === id &&
                      (queue === "all" || WORK_ITEM_QUEUE_MAP[item.type]?.queue === queue),
                  ).length;

            return (
              <TabsTrigger
                key={id}
                value={id}
                className="flex-none px-2.5 text-xs"
                data-testid={`worklist-tab-${id}`}
              >
                {id === "all" ? "All Types" : (WORK_ITEM_TYPE_LABEL[id] ?? id)}
                {list.data && (
                  <span className="ml-1 rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                    {count}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {list.isError ? (
        <ErrorState message="Could not load the worklist." onRetry={() => void list.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(item) => item.id}
          isLoading={list.isPending}
          empty={
            <EmptyState
              icon={ListChecks}
              title={status === "open" ? "Nothing open in this queue" : "Nothing completed yet"}
              description="Pick another queue or task type, or check back after the next case transition."
              className="border-0 py-8"
            />
          }
          data-testid="worklist-table"
        />
      )}
    </div>
  );
}
