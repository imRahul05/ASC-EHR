"use client";

import Link from "next/link";
import { useWorklist } from "@asc/api-client/react";
import { formatDateTime } from "@asc/clinical-rules/time";
import type { StaffRole, WorkItem, WorkItemType } from "@asc/types";
import { Badge, Button, EmptyState, ErrorState, LoadingSkeleton, SectionCard } from "@asc/ui";
import { ListChecks } from "@asc/ui/icons";
import { workItemHref } from "../worklist/work-item-links";

interface WorkItemsPanelProps {
  readonly role: StaffRole;
  readonly title: string;
  readonly type?: WorkItemType;
  readonly limit?: number;
}

const PRIORITY_CLASS: Readonly<Record<WorkItem["priority"], string>> = {
  high: "border-destructive/30 bg-destructive/8 text-destructive",
  normal: "border-border text-muted-foreground",
  low: "border-border text-muted-foreground",
};

/** Open work items for a role (optionally one type, e.g. the surgeon's sign queue). */
export function WorkItemsPanel({ role, title, type, limit = 6 }: WorkItemsPanelProps) {
  const list = useWorklist({ role, status: "open", ...(type ? { type } : {}) });
  const items = (list.data ?? []).slice(0, limit);

  return (
    <SectionCard
      title={title}
      description={list.data ? `${list.data.length} open` : undefined}
      actions={
        <Button variant="ghost" size="sm" render={<Link href={type ? `/worklist?type=${type}` : "/worklist"} />} nativeButton={false}>
          Worklist
        </Button>
      }
      contentClassName="p-2"
      data-testid={`dashboard-work-${type ?? "all"}`}
    >
      {list.isPending && <LoadingSkeleton variant="table" rows={3} />}
      {list.isError && <ErrorState message="Could not load work items." onRetry={() => void list.refetch()} />}
      {list.isSuccess && items.length === 0 && <EmptyState icon={ListChecks} title="All caught up" description="Nothing is waiting on you." className="py-8" />}
      {items.length > 0 && (
        <ul className="divide-y divide-border/60">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={workItemHref(item)}
                className="flex items-start gap-3 rounded-lg px-2 py-2 outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/40"
                data-testid={`dashboard-work-item-${item.id}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant="outline" className={PRIORITY_CLASS[item.priority]}>
                    {item.priority}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground tabular-nums">due {formatDateTime(item.dueAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
