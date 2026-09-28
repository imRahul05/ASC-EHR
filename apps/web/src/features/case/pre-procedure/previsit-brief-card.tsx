import type { Patient, PreVisitBrief } from "@asc/types";
import { AiBadge, Badge, Button, EmptyState, ProvenanceChip, SectionCard } from "@asc/ui";
import { Check, FileSearch, PencilLine, Sparkles } from "@asc/ui/icons";

interface PrevisitBriefCardProps {
  readonly brief: PreVisitBrief | null;
  readonly patient: Pick<Patient, "medications" | "allergies">;
  readonly indication: string;
  /** Brief text is already in the interval history (derived from the form value). */
  readonly included: boolean;
  readonly disabled: boolean;
  readonly onAccept: () => void;
  readonly onEdit: () => void;
}

/**
 * AI pre-visit brief (draft-first, ui-guidelines §6). Pattern from MindScript `lib/previsit.ts`: a short
 * history-only brief labelled "pending review" (docs/MindScript-How-It-Works.md, pre-visit prep row).
 * Nothing is written to the H&P until the clinician accepts or edits it.
 */
export function PrevisitBriefCard({ brief, patient, indication, included, disabled, onAccept, onEdit }: PrevisitBriefCardProps) {
  if (!brief) {
    return (
      <SectionCard title="Pre-visit brief" data-testid="hp-brief">
        <EmptyState icon={Sparkles} title="No brief for this case" description="Take the history directly in the H&P below." />
      </SectionCard>
    );
  }

  const sources = [
    { id: "indication", label: "Case indication", detail: indication },
    { id: "meds", label: "Medication list", detail: `${patient.medications.length} active` },
    { id: "allergies", label: "Allergy list", detail: `${patient.allergies.length} record(s)` },
  ];

  return (
    <SectionCard
      title={
        <span className="flex flex-wrap items-center gap-2">
          Pre-visit brief
          {included ? (
            <Badge variant="outline" className="gap-1 text-success">
              <Check aria-hidden /> In H&P
            </Badge>
          ) : (
            <AiBadge label="AI draft · pending review" />
          )}
        </span>
      }
      description="History-only summary drafted before the visit. Review before it becomes part of the H&P."
      actions={<ProvenanceChip provenance={brief.provenance} />}
      className="border-ai-border"
      data-testid="hp-brief"
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed">{brief.summary}</p>

        {brief.flags.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Flags for review</p>
            <ul className="space-y-1">
              {brief.flags.map((flag) => (
                <li key={flag} className="flex items-start gap-2 rounded-md bg-warning/10 px-2.5 py-1.5 text-sm text-foreground">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning" />
                  {flag}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <FileSearch aria-hidden className="size-3.5" /> Sources
          </p>
          <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-3" data-testid="hp-brief-sources">
            {sources.map((source) => (
              <li key={source.id} className="rounded-md border border-border px-2 py-1.5">
                <span className="block font-medium text-foreground">{source.label}</span>
                <span className="line-clamp-2">{source.detail}</span>
              </li>
            ))}
          </ul>
        </div>

        {!included && (
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11" onClick={onAccept} disabled={disabled} data-testid="hp-brief-accept">
              <Check aria-hidden /> Accept into history
            </Button>
            <Button variant="outline" className="min-h-11" onClick={onEdit} disabled={disabled} data-testid="hp-brief-edit">
              <PencilLine aria-hidden /> Edit in history
            </Button>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
