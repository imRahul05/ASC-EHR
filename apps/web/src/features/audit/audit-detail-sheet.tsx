"use client";

import Link from "next/link";
import { formatDateTime } from "@asc/clinical-rules/time";
import type { AuditEvent } from "@asc/types";
import { Button, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@asc/ui";
import { ExternalLink } from "@asc/ui/icons";

interface AuditDetailSheetProps {
  readonly event: AuditEvent | null;
  readonly onClose: () => void;
}

/** Audit event detail: identifiers, codes and outcome only — never clinical content. */
export function AuditDetailSheet({ event, onClose }: AuditDetailSheetProps) {
  const fields = event
    ? [
        { label: "Event id", value: event.id, mono: true },
        { label: "Time", value: formatDateTime(event.at), mono: false },
        { label: "Actor", value: `${event.actor.name} (${event.actor.role})`, mono: false },
        { label: "Actor id", value: event.actor.id, mono: true },
        { label: "Action", value: event.action, mono: true },
        { label: "Resource", value: `${event.entity.type}/${event.entity.id}`, mono: true },
        { label: "Outcome", value: event.outcome, mono: false },
        { label: "Summary", value: event.summary, mono: false },
        ...(event.agentExecutionId ? [{ label: "AI execution", value: event.agentExecutionId, mono: true }] : []),
      ]
    : [];

  return (
    <Sheet open={event !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent className="w-full sm:max-w-md" data-testid="audit-detail">
        <SheetHeader>
          <SheetTitle>{event?.action ?? "Event"}</SheetTitle>
          <SheetDescription>Identifiers and codes only. Open the resource to see clinical content (access is itself audited).</SheetDescription>
        </SheetHeader>
        <dl className="space-y-3 px-4">
          {fields.map((field) => (
            <div key={field.label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 text-sm">
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd className={field.mono ? "font-mono text-xs break-all" : "break-words"}>{field.value}</dd>
            </div>
          ))}
        </dl>
        {event?.entity.type === "ProcedureCase" && (
          <div className="px-4 pt-2">
            <Button variant="outline" render={<Link href={`/cases/${event.entity.id}`} />} nativeButton={false} onClick={onClose}>
              <ExternalLink /> Open case
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
