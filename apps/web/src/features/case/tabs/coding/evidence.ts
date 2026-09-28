import type { CaseDetail, CasePathology, EvidenceRef, NoteDraft } from "@asc/types";

/** Stable key for an evidence link (kind + id). */
export const evidenceKey = (ref: EvidenceRef) => `${ref.kind}:${ref.id}`;

interface EvidenceSources {
  readonly detail: CaseDetail | undefined;
  readonly note: NoteDraft | null | undefined;
  readonly pathology: CasePathology | undefined;
}

type Resolver = (id: string, sources: EvidenceSources) => string | undefined;

/** Where the text behind each evidence kind lives (Record lookup, not a switch). */
const RESOLVE: Readonly<Record<EvidenceRef["kind"], Resolver>> = {
  note_section: (id, { note }) => note?.sections.find((section) => section.id === id)?.content,
  finding: (id, { note }) => {
    const finding = note?.findings.find((item) => item.id === id);
    return finding ? `${finding.description}${finding.sizeMm ? ` (${finding.sizeMm} mm)` : ""} — ${finding.intervention}` : undefined;
  },
  specimen: (id, { detail }) => {
    const specimen = detail?.specimens.find((item) => item.id === id);
    return specimen
      ? `Jar ${specimen.jar} · ${specimen.site.replaceAll("_", " ")}: ${specimen.description}${specimen.sizeMm ? `, ${specimen.sizeMm} mm` : ""}, ${specimen.removalMethod.replaceAll("_", " ")}.`
      : undefined;
  },
  event: (id, { detail }) => {
    const event = detail?.events.find((item) => item.id === id);
    return event ? `${event.type.replaceAll("_", " ").toLowerCase()}${event.note ? ` — ${event.note}` : ""}` : undefined;
  },
  pathology: (id, { pathology }) => pathology?.results.find((item) => item.id === id)?.reportText,
};

/** The source sentence / finding an AI code was grounded on, or `undefined` when it is not loaded yet. */
export function resolveEvidence(ref: EvidenceRef, sources: EvidenceSources): string | undefined {
  return RESOLVE[ref.kind](ref.id, sources);
}
