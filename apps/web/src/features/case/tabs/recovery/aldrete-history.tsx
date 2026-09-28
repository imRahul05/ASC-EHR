"use client";

import { useAuditLog } from "@asc/api-client/react";
import { formatTime24 } from "@asc/clinical-rules/time";
import { Sparkline } from "@asc/ui";

interface AldreteHistoryProps {
  readonly caseId: string;
}

const TOTAL_PATTERN = /Aldrete (\d+)\/10/;

/** Aldrete time series for this stay, read from the case's audit trail (`aldrete.record` events, oldest → newest). */
export function AldreteHistory({ caseId }: AldreteHistoryProps) {
  const log = useAuditLog({ entityId: caseId, action: "aldrete.record" });
  const series = (log.data ?? [])
    .map((event) => ({ id: event.id, at: event.at, total: Number(TOTAL_PATTERN.exec(event.summary)?.[1] ?? Number.NaN) }))
    .filter((point) => Number.isFinite(point.total))
    .reverse();

  if (series.length === 0) return null;
  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 p-3" data-testid="recovery-aldrete-history">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">Scores this stay</p>
        {series.length > 1 && (
          <Sparkline
            values={series.map((point) => point.total)}
            min={0}
            max={10}
            label={`Aldrete trend, latest ${series.at(-1)?.total ?? ""} of 10`}
            className="text-chart-1"
          />
        )}
      </div>
      <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {series.map((point) => (
          <li key={point.id} className="tabular-nums">
            <span className="text-muted-foreground">{formatTime24(point.at)}</span> <span className="font-medium">{point.total}/10</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
