import type { QualityPoint } from "@asc/types";

/** GI society ADR targets (overall ≥ 25 %; aspirational ≥ 30 %). */
export const ADR_TARGETS = [
  { value: 0.25, label: "25 % min" },
  { value: 0.3, label: "30 % goal" },
] as const;

export const formatPercent = (value: number) => `${Math.round(value * 100)} %`;
export const formatMinutes = (value: number) => `${value.toFixed(1)} min`;

type MetricKey = Exclude<keyof QualityPoint, "date" | "cases">;
type BenchmarkKey = "adr" | "cir" | "withdrawalMin" | "bbpsAdequate";

/** Quality metrics shown as tiles + 30-day trends (config drives both). */
export const QUALITY_METRICS: readonly {
  readonly key: MetricKey;
  readonly label: string;
  readonly description: string;
  readonly format: (value: number) => string;
  /** Where the benchmark comes from (`QualityMetrics.benchmarks`); turnaround has a fixed goal. */
  readonly benchmark: BenchmarkKey | { readonly value: number };
  readonly targetLabel: (value: number) => string;
  /** Lower is better (turnaround); default higher. */
  readonly lowerIsBetter?: boolean;
  readonly domain?: readonly [number, number];
}[] = [
  {
    key: "adr",
    label: "Adenoma detection rate",
    description: "Screening colonoscopies with ≥ 1 adenoma",
    format: formatPercent,
    benchmark: "adr",
    targetLabel: (value) => `goal ${formatPercent(value)}`,
    domain: [0.1, 0.5],
  },
  {
    key: "cir",
    label: "Cecal intubation rate",
    description: "Complete colonoscopies (photo-documented)",
    format: formatPercent,
    benchmark: "cir",
    targetLabel: (value) => `goal ${formatPercent(value)}`,
    domain: [0.8, 1],
  },
  {
    key: "withdrawalMin",
    label: "Mean withdrawal time",
    description: "Negative screening exams",
    format: formatMinutes,
    benchmark: "withdrawalMin",
    targetLabel: (value) => `min ${value} min`,
    domain: [4, 12],
  },
  {
    key: "bbpsAdequate",
    label: "Adequate bowel prep",
    description: "BBPS ≥ 6 with every segment ≥ 2",
    format: formatPercent,
    benchmark: "bbpsAdequate",
    targetLabel: (value) => `goal ${formatPercent(value)}`,
    domain: [0.7, 1],
  },
  {
    key: "turnaroundMin",
    label: "Room turnover",
    description: "Scope out → next patient in room",
    format: (value) => `${Math.round(value)} min`,
    benchmark: { value: 15 },
    targetLabel: (value) => `goal ≤ ${value} min`,
    lowerIsBetter: true,
    domain: [5, 25],
  },
];
