import type { VitalsEntry } from "@asc/types";
import { Sparkline } from "@asc/ui";

interface VitalsTrendsProps {
  readonly vitals: readonly VitalsEntry[];
}

/** Small multiples: one inline trend per vital with its latest value + unit (chart tokens only). */
const TRENDS: readonly {
  readonly id: string;
  readonly label: string;
  readonly unit: string;
  readonly tone: string;
  readonly value: (entry: VitalsEntry) => number | undefined;
}[] = [
  { id: "hr", label: "HR", unit: "bpm", tone: "text-chart-1", value: (entry) => entry.hr },
  { id: "sbp", label: "SBP", unit: "mmHg", tone: "text-chart-2", value: (entry) => entry.sbp },
  { id: "spo2", label: "SpO₂", unit: "%", tone: "text-chart-3", value: (entry) => entry.spo2 },
  { id: "etco2", label: "EtCO₂", unit: "mmHg", tone: "text-chart-4", value: (entry) => entry.etco2 },
];

export function VitalsTrends({ vitals }: VitalsTrendsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4" data-testid="anesthesia-trends">
      {TRENDS.map((trend) => {
        const values = vitals.map(trend.value).filter((value): value is number => value !== undefined);
        const latest = values.at(-1);
        return (
          <div key={trend.id} className="rounded-xl border border-border bg-card p-3 shadow-xs">
            <p className="text-xs font-medium text-muted-foreground">{trend.label}</p>
            <div className="mt-1 flex items-end justify-between gap-2">
              <p className="text-xl font-semibold tabular-nums">
                {latest ?? "—"} <span className="text-xs font-normal text-muted-foreground">{trend.unit}</span>
              </p>
              {values.length > 1 && (
                <Sparkline values={values} label={`${trend.label} trend, latest ${latest ?? "none"} ${trend.unit}`} className={`h-8 w-28 ${trend.tone}`} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
