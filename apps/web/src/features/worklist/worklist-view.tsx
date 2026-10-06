"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@asc/api-client";
import { useCompleteWorkItem, useWorklist } from "@asc/api-client/react";
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
import { AlarmClock, Check, ListChecks } from "@asc/ui/icons";
import { useCan } from "@/hooks/use-can";
import { WORK_ITEM_TYPE_LABEL, workItemHref } from "./work-item-links";

type TabId = WorkItemType | "all";
type StatusFilter = WorkItem["status"];

const TABS: readonly TabId[] = ["all", "sign_note", "eligibility_failed", "referral_intake", "pending_pathology", "coding", "result_letter", "med_hold_review"];
const ROLE_LABEL: Readonly<Record<ParticipantRole, string>> = { ADMIN: "Front desk / coder", SURGEON: "Surgeon", NURSE: "Nurse", ANESTHESIOLOGIST: "Anesthesia" };
const PRIORITY_CLASS: Readonly<Record<WorkItem["priority"], string>> = {
  high: "border-destructive/30 bg-destructive/8 text-destructive",
  normal: "text-muted-foreground",
  low: "text-muted-foreground",
};
const STATUS_OPTIONS: readonly { readonly value: StatusFilter; readonly label: string }[] = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
];

const isTab = (value: string | null): value is TabId => TABS.some((tab) => tab === value);

/** `/worklist` — tasks by type (tab in `?type=`), assignee role, due time; opens the right case tab. */
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
  const requested = params.get("type");
  // Whoever drafts notes (physicians) lands on their sign queue; everyone else on all work.
  const tab: TabId = isTab(requested) ? requested : can("note.draft") ? "sign_note" : "all";
  const status: StatusFilter = params.get("status") === "done" ? "done" : "open";
  const list = useWorklist({ status });
  const complete = useCompleteWorkItem();
  const all = list.data ?? [];
  const rows = tab === "all" ? all : all.filter((item) => item.type === tab);

  const setParam = (key: "type" | "status", value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const onComplete = (item: WorkItem) =>
    complete.mutate(item.id, {
      onSuccess: () => toast.success("Marked done"),
      onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not update the task"),
    });

  const now = useNow();
  const columns: readonly DataTableColumn<WorkItem>[] = [
    {
      id: "task",
      header: "Task",
      className: "min-w-64 whitespace-normal",
      cell: (item) => (
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{item.title}</p>
          <p className="text-xs text-muted-foreground">{item.detail}</p>
        </div>
      ),
    },
    { id: "type", header: "Type", cell: (item) => <Badge variant="secondary">{WORK_ITEM_TYPE_LABEL[item.type]}</Badge> },
    { id: "assignee", header: "Assignee", cell: (item) => <span className="text-sm">{ROLE_LABEL[item.ownerRole]}</span> },
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
        const overdue = item.status === "open" && Date.parse(item.dueAt) < now;
        return (
          <span className={overdue ? "inline-flex items-center gap-1 text-sm text-destructive tabular-nums" : "text-sm tabular-nums"}>
            {overdue && <AlarmClock className="size-3.5" aria-label="Overdue" />}
            {formatDateTime(item.dueAt)}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (item) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="outline" render={<Link href={workItemHref(item)} />} nativeButton={false} data-testid={`worklist-open-${item.id}`}>
            Open
          </Button>
          {item.status === "open" && (
            <Button size="icon-sm" variant="ghost" aria-label={`Mark "${item.title}" done`} onClick={() => onComplete(item)} disabled={complete.isPending} data-testid={`worklist-done-${item.id}`}>
              <Check />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6" data-testid="worklist">
      <PageHeader
        title="Worklist"
        description="Everything waiting on a person — sorted by priority, then due time."
        actions={<SegmentedControl aria-label="Status" size="sm" className="w-40" options={STATUS_OPTIONS} value={status} onValueChange={(value) => setParam("status", value)} data-testid="worklist-status" />}
      />
      <Tabs value={tab} onValueChange={(value) => setParam("type", String(value))}>
        <TabsList variant="line" className="h-auto! w-full flex-wrap justify-start border-b border-border pb-px" aria-label="Task types">
          {TABS.map((id) => {
            const count = id === "all" ? all.length : all.filter((item) => item.type === id).length;
            return (
              <TabsTrigger key={id} value={id} className="flex-none px-2.5" data-testid={`worklist-tab-${id}`}>
                {id === "all" ? "All" : WORK_ITEM_TYPE_LABEL[id]}
                {list.data && <span className="ml-1 rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{count}</span>}
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
          empty={<EmptyState icon={ListChecks} title={status === "open" ? "Nothing open here" : "Nothing completed yet"} description="Pick another type, or check back after the next case." className="border-0 py-8" />}
          data-testid="worklist-table"
        />
      )}
    </div>
  );
}
