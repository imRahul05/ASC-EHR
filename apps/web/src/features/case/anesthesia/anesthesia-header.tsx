"use client";

import { useIsMutating } from "@tanstack/react-query";
import { useAddAnesthesiaEntry } from "@asc/api-client/react";
import { ANESTHESIA_TECHNIQUE_LABEL, formatTime24 } from "@asc/clinical-rules";
import type { CaseDetail } from "@asc/types";
import { Badge, Button, ElapsedTime, OfflineQueueBadge, toast, useOnlineStatus } from "@asc/ui";
import { CircleStop, Play } from "@asc/ui/icons";
import { notifyError } from "../notify-error";

interface AnesthesiaHeaderProps {
  readonly detail: CaseDetail;
  readonly editable: boolean;
}

/** Provider, technique, ASA, sedation start/end with running sedation time, and the offline-queue pill. */
export function AnesthesiaHeader({ detail, editable }: AnesthesiaHeaderProps) {
  const online = useOnlineStatus();
  const queued = useIsMutating();
  const add = useAddAnesthesiaEntry(detail.case.id);
  const record = detail.anesthesia;
  const asa = detail.case.asa ?? detail.hp?.asa ?? null;

  const sedation = (edge: "start" | "end") =>
    add.mutate(
      { kind: "sedation", edge },
      { onSuccess: () => toast.success(`Sedation ${edge} recorded`), onError: notifyError("Could not record sedation") },
    );

  return (
    <section
      aria-label="Anesthesia summary"
      data-testid="anesthesia-header"
      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-xs"
    >
      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Provider</dt>
          <dd className="font-medium">{record.provider.name}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Technique</dt>
          <dd className="font-medium">{ANESTHESIA_TECHNIQUE_LABEL[record.technique]}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">ASA</dt>
          <dd>
            {asa ? (
              <Badge variant="outline" className="font-semibold" data-testid="anesthesia-asa">
                ASA {asa}
              </Badge>
            ) : (
              <span className="text-warning">Not recorded</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Sedation</dt>
          <dd className="font-medium tabular-nums" data-testid="anesthesia-sedation">
            {record.sedationStart ? (
              <>
                {formatTime24(record.sedationStart)}–{record.sedationEnd ? formatTime24(record.sedationEnd) : "now"} ·{" "}
                <ElapsedTime since={record.sedationStart} until={record.sedationEnd} label="Sedation time" />
              </>
            ) : (
              "Not started"
            )}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <OfflineQueueBadge online={online} queued={queued} />
        {editable && !record.sedationStart && (
          <Button className="h-11" disabled={add.isPending} onClick={() => sedation("start")} data-testid="anesthesia-sedation-start">
            <Play /> Start sedation
          </Button>
        )}
        {editable && record.sedationStart && !record.sedationEnd && (
          <Button variant="outline" className="h-11" disabled={add.isPending} onClick={() => sedation("end")} data-testid="anesthesia-sedation-end">
            <CircleStop /> End sedation
          </Button>
        )}
      </div>
    </section>
  );
}
