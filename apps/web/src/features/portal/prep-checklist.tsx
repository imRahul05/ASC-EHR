"use client";

import { ApiError } from "@asc/api-client";
import { useUpdatePrepItem } from "@asc/api-client/react";
import { formatTime24, formatWeekday, toIsoDate } from "@asc/clinical-rules/time";
import type { PrepItem } from "@asc/types";
import { Checkbox, Progress, SectionCard, toast } from "@asc/ui";

const DAY_MS = 86_400_000;

/** Heading for a day relative to the procedure date. */
function dayHeading(dateIso: string, procedureDate: string): string {
  const days = Math.round((Date.parse(`${procedureDate}T00:00:00`) - Date.parse(`${dateIso}T00:00:00`)) / DAY_MS);
  const relative = days === 0 ? "Procedure day" : days === 1 ? "The day before" : `${days} days before`;
  return `${relative} · ${formatWeekday(dateIso)}`;
}

interface PrepChecklistProps {
  readonly items: readonly PrepItem[];
  readonly procedureStart: string;
}

/** Bowel prep as a day-by-day timeline; the patient ticks off each step (saved to their chart). */
export function PrepChecklist({ items, procedureStart }: PrepChecklistProps) {
  const update = useUpdatePrepItem();
  const sorted = [...items].sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const days = [...new Set(sorted.map((item) => toIsoDate(new Date(item.dueAt))))];
  const procedureDate = toIsoDate(new Date(procedureStart));
  const done = items.filter((item) => item.done).length;

  const onToggle = (item: PrepItem, checked: boolean) =>
    update.mutate(
      { itemId: item.id, done: checked },
      { onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not save — please try again") },
    );

  return (
    <SectionCard
      title="Getting ready"
      description="A clean colon lets your doctor see clearly. Tick each step as you go."
      actions={<span className="text-sm text-muted-foreground tabular-nums">{done}/{items.length} done</span>}
      data-testid="portal-prep"
    >
      <Progress value={items.length ? (done / items.length) * 100 : 0} tone="success" aria-label={`${done} of ${items.length} prep steps done`} className="mb-6" />
      <ol className="space-y-6">
        {days.map((day) => (
          <li key={day}>
            <h3 className="mb-3 text-sm font-semibold">{dayHeading(day, procedureDate)}</h3>
            <ol className="relative space-y-3 border-l border-border pl-5">
              {sorted
                .filter((item) => toIsoDate(new Date(item.dueAt)) === day)
                .map((item) => (
                  <li key={item.id} className="relative">
                    <span aria-hidden className={`absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-2 ring-card ${item.done ? "bg-success" : "bg-muted-foreground/40"}`} />
                    <label htmlFor={`prep-${item.id}`} className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-muted/50">
                      <Checkbox
                        id={`prep-${item.id}`}
                        checked={item.done}
                        onCheckedChange={(checked) => onToggle(item, checked === true)}
                        disabled={update.isPending}
                        className="mt-0.5"
                        data-testid={`portal-prep-${item.id}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm font-medium ${item.done ? "text-muted-foreground line-through" : ""}`}>{item.label}</span>
                        <span className="block text-sm text-muted-foreground">{item.detail}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatTime24(item.dueAt)}</span>
                    </label>
                  </li>
                ))}
            </ol>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}
