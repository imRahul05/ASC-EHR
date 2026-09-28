import { ANATOMIC_SITE_LABEL, formatTime24, REMOVAL_METHOD_LABEL } from "@asc/clinical-rules";
import type { AnatomicSite, PatientRef, RemovalMethod } from "@asc/types";
import { Badge, cn } from "@asc/ui";
import { Camera, TriangleAlert } from "@asc/ui/icons";

interface SpecimenLabelProps {
  readonly jar: string;
  readonly patient: PatientRef;
  readonly caseNumber: string;
  readonly site: AnatomicSite | null;
  readonly sizeMm?: number;
  readonly removalMethod: RemovalMethod;
  readonly description: string;
  readonly collectedAt?: string;
  readonly status?: string;
  readonly imageCount?: number;
  /** Unsaved preview (dashed border). */
  readonly preview?: boolean;
  readonly "data-testid"?: string;
}

/** Jar label as printed for the lab (two identifiers + case, jar, site, size, method). */
export function SpecimenLabel({
  jar,
  patient,
  caseNumber,
  site,
  sizeMm,
  removalMethod,
  description,
  collectedAt,
  status,
  imageCount = 0,
  preview = false,
  "data-testid": testId,
}: SpecimenLabelProps) {
  return (
    <article
      data-testid={testId}
      className={cn(
        "flex gap-3 rounded-xl border-2 bg-background p-3",
        preview ? "border-dashed border-primary/50" : "border-border",
      )}
    >
      <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-lg bg-foreground text-background">
        <span className="text-[10px] font-semibold tracking-wide uppercase opacity-80">Jar</span>
        <span className="text-2xl leading-none font-bold">{jar}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-base font-semibold">
          {site ? ANATOMIC_SITE_LABEL[site] : "Choose a site"} · {description || "Polyp"}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {sizeMm ? (
            <span className="font-medium tabular-nums">{sizeMm} mm</span>
          ) : (
            <span className="inline-flex items-center gap-1 font-medium text-destructive">
              <TriangleAlert aria-hidden className="size-4" /> Size missing
            </span>
          )}
          <span>{REMOVAL_METHOD_LABEL[removalMethod]}</span>
          {collectedAt && <span className="text-muted-foreground tabular-nums">{formatTime24(collectedAt)}</span>}
          {imageCount > 0 && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Camera aria-hidden className="size-4" /> {imageCount} linked
            </span>
          )}
          {status && (
            <Badge variant="outline" className="capitalize">
              {status}
            </Badge>
          )}
        </p>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {patient.displayName} · MRN {patient.mrn} · DOB {patient.dateOfBirth} · {caseNumber}
        </p>
      </div>
    </article>
  );
}
