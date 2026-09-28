import type { AnesthesiaDrug, AnesthesiaRecord, DoseUnit, VitalsEntry } from "@asc/types";

/** Flowsheet column width (AIMS standard). */
export const FLOWSHEET_INTERVAL_MIN = 5;
const INTERVAL_MS = FLOWSHEET_INTERVAL_MIN * 60_000;
/** Show at least this many columns so the grid reads as a time axis even early in a case. */
const MIN_COLUMNS = 6;

/** Vitals rows of the flowsheet (config → `.map()`); `value` reads one entry. */
export const VITAL_ROWS: readonly {
  readonly id: "hr" | "bp" | "spo2" | "etco2" | "rr";
  readonly label: string;
  readonly unit: string;
  readonly value: (entry: VitalsEntry) => string | null;
}[] = [
  { id: "hr", label: "HR", unit: "bpm", value: (entry) => String(entry.hr) },
  { id: "bp", label: "BP", unit: "mmHg", value: (entry) => `${entry.sbp}/${entry.dbp}` },
  { id: "spo2", label: "SpO₂", unit: "%", value: (entry) => String(entry.spo2) },
  { id: "etco2", label: "EtCO₂", unit: "mmHg", value: (entry) => (entry.etco2 === undefined ? null : String(entry.etco2)) },
  { id: "rr", label: "RR", unit: "/min", value: (entry) => String(entry.rr) },
];

/** Drug presets: unit + quick-dose buttons (typical endoscopy MAC doses). */
export const DRUG_PRESETS: Readonly<Record<AnesthesiaDrug, { readonly unit: DoseUnit; readonly quick: readonly number[] }>> = {
  propofol: { unit: "mg", quick: [20, 30, 50] },
  lidocaine: { unit: "mg", quick: [40] },
  midazolam: { unit: "mg", quick: [1, 2] },
  fentanyl: { unit: "mcg", quick: [25, 50] },
  glycopyrrolate: { unit: "mg", quick: [0.2] },
  ephedrine: { unit: "mg", quick: [5, 10] },
  phenylephrine: { unit: "mcg", quick: [100] },
  ondansetron: { unit: "mg", quick: [4] },
};

export const DRUGS = Object.keys(DRUG_PRESETS) as AnesthesiaDrug[];

/** Start of the time axis: sedation start, else the first entry. */
function axisStart(record: AnesthesiaRecord): number | null {
  const instants = [
    record.sedationStart,
    ...record.vitals.map((entry) => entry.recordedAt),
    ...record.doses.map((dose) => dose.at),
  ].filter((value): value is string => value !== undefined);
  if (instants.length === 0) return null;
  const first = Math.min(...instants.map((value) => Date.parse(value)));
  return Math.floor(first / INTERVAL_MS) * INTERVAL_MS;
}

/** 5-minute column starts (epoch ms) covering every entry. */
export function flowsheetColumns(record: AnesthesiaRecord, now: number, live: boolean): readonly number[] {
  const start = axisStart(record);
  if (start === null) return [];
  const instants = [
    ...record.vitals.map((entry) => entry.recordedAt),
    ...record.doses.map((dose) => dose.at),
    ...record.airwayEvents.map((event) => event.at),
    ...(record.sedationEnd ? [record.sedationEnd] : []),
  ].map((value) => Date.parse(value));
  const last = Math.max(start, ...instants, live ? now : start);
  const count = Math.max(MIN_COLUMNS, Math.floor((last - start) / INTERVAL_MS) + 1);
  return Array.from({ length: count }, (_, index) => start + index * INTERVAL_MS);
}

export function columnOf(columns: readonly number[], iso: string): number {
  const at = Date.parse(iso);
  const first = columns[0];
  if (first === undefined) return -1;
  return Math.min(columns.length - 1, Math.max(0, Math.floor((at - first) / INTERVAL_MS)));
}

/** Round to 2 decimals for dose totals (0.2 mg glyco adds cleanly). */
export function roundDose(value: number): number {
  return Math.round(value * 100) / 100;
}
