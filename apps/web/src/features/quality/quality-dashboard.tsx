"use client";

import { useState } from "react";
import { useQualityMetrics } from "@asc/api-client/react";
import { formatDate, formatWeekday } from "@asc/clinical-rules/time";
import type { QualityMetrics, QualityPoint } from "@asc/types";
import {
  DataTable,
  ErrorState,
  LoadingSkeleton,
  PageHeader,
  SectionCard,
  SegmentedControl,
  StatCard,
  TargetBarList,
  TrendChart,
  type DataTableColumn,
} from "@asc/ui";
import { ADR_TARGETS, formatMinutes, formatPercent, QUALITY_METRICS } from "./quality-metrics-config";

type View = "charts" | "table";
const VIEWS: readonly { readonly value: View; readonly label: string }[] = [
  { value: "charts", label: "Charts" },
  { value: "table", label: "Table" },
];

type Metric = (typeof QUALITY_METRICS)[number];

function targetOf(metric: Metric, data: QualityMetrics): number {
  return typeof metric.benchmark === "string" ? data.benchmarks[metric.benchmark] : metric.benchmark.value;
}

const meets = (metric: Metric, value: number, target: number) => (metric.lowerIsBetter ? value <= target : value >= target);

const HISTORY_COLUMNS: readonly DataTableColumn<QualityPoint>[] = [
  { id: "date", header: "Date", cell: (row) => <span className="tabular-nums">{formatWeekday(row.date)}</span> },
  { id: "cases", header: "Cases", align: "right", cell: (row) => <span className="tabular-nums">{row.cases}</span> },
  { id: "adr", header: "ADR", align: "right", cell: (row) => <span className="tabular-nums">{formatPercent(row.adr)}</span> },
  { id: "cir", header: "Cecal intubation", align: "right", cell: (row) => <span className="tabular-nums">{formatPercent(row.cir)}</span> },
  { id: "wd", header: "Withdrawal", align: "right", cell: (row) => <span className="tabular-nums">{formatMinutes(row.withdrawalMin)}</span> },
  { id: "bbps", header: "BBPS adequate", align: "right", cell: (row) => <span className="tabular-nums">{formatPercent(row.bbpsAdequate)}</span> },
  { id: "turn", header: "Turnover", align: "right", cell: (row) => <span className="tabular-nums">{row.turnaroundMin} min</span> },
];

/** `/quality` — GI quality indicators (ADR by surgeon vs 25 % / 30 %, CIR, withdrawal, BBPS, turnover), 30-day trends. */
export function QualityDashboard() {
  const [view, setView] = useState<View>("charts");
  const quality = useQualityMetrics();

  if (quality.isPending) return <LoadingSkeleton variant="page" />;
  if (quality.isError) return <ErrorState title="Could not load quality metrics" onRetry={() => void quality.refetch()} />;

  const data = quality.data;
  const providers = [...data.byProvider].sort((a, b) => b.adr - a.adr);

  return (
    <div className="space-y-6" data-testid="quality-dashboard">
      <PageHeader
        title="Quality"
        description={`${formatDate(data.from)} – ${formatDate(data.to)} · ${data.current.cases} colonoscopies`}
        actions={<SegmentedControl aria-label="View" size="sm" className="w-44" options={VIEWS} value={view} onValueChange={setView} data-testid="quality-view" />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="quality-stats">
        {QUALITY_METRICS.map((metric) => {
          const value = data.current[metric.key];
          const target = targetOf(metric, data);
          const ok = meets(metric, value, target);
          return (
            <StatCard
              key={metric.key}
              label={metric.label}
              value={metric.format(value)}
              hint={metric.targetLabel(target)}
              tone={ok ? "default" : "warning"}
              trend={{ direction: ok ? "up" : "down", label: ok ? "meets" : "below", positive: ok }}
            />
          );
        })}
      </div>

      <SectionCard title="Adenoma detection rate by surgeon" description="30-day ADR against the 25 % minimum and 30 % goal" data-testid="quality-adr-by-surgeon">
        <TargetBarList
          rows={providers.map((item) => ({ id: item.provider.id, label: item.provider.name, value: item.adr, hint: `${item.cases} cases · withdrawal ${formatMinutes(item.withdrawalMin)}` }))}
          max={0.5}
          formatValue={formatPercent}
          targets={ADR_TARGETS}
        />
      </SectionCard>

      {view === "charts" ? (
        <div className="grid gap-4 md:grid-cols-2" data-testid="quality-trends">
          {QUALITY_METRICS.map((metric) => {
            const target = targetOf(metric, data);
            return (
              <SectionCard key={metric.key} title={metric.label} description={metric.description}>
                <TrendChart
                  title={`${metric.label}, last 30 days`}
                  points={data.history.map((point) => ({ key: point.date, label: formatWeekday(point.date), value: point[metric.key] }))}
                  formatValue={metric.format}
                  target={{ value: target, label: metric.targetLabel(target) }}
                  domain={metric.domain}
                  data-testid={`quality-trend-${metric.key}`}
                />
              </SectionCard>
            );
          })}
        </div>
      ) : (
        <DataTable columns={HISTORY_COLUMNS} rows={[...data.history].reverse()} getRowId={(row) => row.date} data-testid="quality-table" />
      )}
    </div>
  );
}
