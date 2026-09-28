import type { Histology, PathologyResult, Specimen } from "@asc/types";

export const HISTOLOGY_LABEL: Readonly<Record<Histology, string>> = {
  tubular_adenoma: "Tubular adenoma",
  tubulovillous_adenoma: "Tubulovillous adenoma",
  villous_adenoma: "Villous adenoma",
  sessile_serrated_lesion: "Sessile serrated lesion",
  hyperplastic: "Hyperplastic polyp",
  normal_mucosa: "Normal mucosa",
  adenocarcinoma: "Adenocarcinoma",
  other: "Other",
};

export const DYSPLASIA_LABEL: Readonly<Record<PathologyResult["dysplasia"], string>> = {
  none: "No dysplasia",
  low_grade: "Low-grade dysplasia",
  high_grade: "High-grade dysplasia",
};

export const SPECIMEN_STATUS: Readonly<Record<Specimen["pathologyStatus"], { readonly label: string; readonly className: string }>> = {
  pending: { label: "Awaiting result", className: "border-warning/30 bg-warning/10 text-warning" },
  resulted: { label: "Result received", className: "border-info/30 bg-info/10 text-info" },
  reconciled: { label: "Reconciled", className: "border-success/30 bg-success/10 text-success" },
};

/** Demo "lab" answers for "Simulate result arrival", by jar order (A, B, C…) — gives the 5-year demo path. */
export const SIMULATED_RESULTS: readonly { readonly histology: Histology; readonly dysplasia: PathologyResult["dysplasia"] }[] = [
  { histology: "tubular_adenoma", dysplasia: "low_grade" },
  { histology: "sessile_serrated_lesion", dysplasia: "none" },
  { histology: "hyperplastic", dysplasia: "none" },
];

export const siteLabel = (site: string) => site.replaceAll("_", " ");
