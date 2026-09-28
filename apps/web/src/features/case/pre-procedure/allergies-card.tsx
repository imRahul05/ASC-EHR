import type { Allergy } from "@asc/types";
import { cn, SectionCard } from "@asc/ui";
import { ShieldCheck, TriangleAlert } from "@asc/ui/icons";
import { SEVERITY_META } from "./hp-config";

interface AllergiesCardProps {
  readonly allergies: readonly Allergy[];
}

export function AllergiesCard({ allergies }: AllergiesCardProps) {
  return (
    <SectionCard title="Allergies" description={allergies.length > 0 ? `${allergies.length} on file` : undefined} data-testid="hp-allergies">
      {allergies.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck aria-hidden className="size-4 text-success" /> No known drug allergies (NKDA)
        </p>
      ) : (
        <ul className="space-y-2">
          {allergies.map((allergy) => {
            const severity = SEVERITY_META[allergy.severity];
            return (
              <li key={allergy.id} className="flex items-start justify-between gap-3 text-sm" data-testid={`hp-allergy-${allergy.id}`}>
                <span className="min-w-0">
                  <span className="font-medium">{allergy.substance}</span>
                  <span className="block text-xs text-muted-foreground">Reaction: {allergy.reaction}</span>
                </span>
                <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", severity.tone)}>
                  <TriangleAlert aria-hidden className="size-3" />
                  {severity.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
