"use client";

import Link from "next/link";
import type { DuplicateMatch } from "@asc/types";
import { Button, SectionCard, Skeleton } from "@asc/ui";
import { CircleCheck, Link2, ScanSearch, TriangleAlert } from "@asc/ui/icons";

interface DuplicatePanelProps {
  readonly status: "idle" | "pending" | "error" | "success";
  readonly matches: readonly DuplicateMatch[];
  readonly canRun: boolean;
  readonly onRun: () => void;
  /** Present when registering from a referral: link the fax to an existing chart instead of creating one. */
  readonly onLink?: (patientId: string) => void;
  readonly linkPending?: boolean;
}

/** Duplicate-chart check (name + DOB) — shown beside registration so the clerk sees matches before creating. */
export function DuplicatePanel({ status, matches, canRun, onRun, onLink, linkPending = false }: DuplicatePanelProps) {
  return (
    <SectionCard
      title="Duplicate check"
      description="Name + date of birth against existing charts."
      data-testid="registration-duplicate-panel"
      actions={
        <Button type="button" variant="outline" size="sm" onClick={onRun} disabled={!canRun || status === "pending"} data-testid="registration-duplicate-run">
          <ScanSearch aria-hidden /> Check
        </Button>
      }
    >
      <div aria-live="polite">
        {status === "idle" && <p className="text-sm text-muted-foreground">Runs when you leave the name or date-of-birth fields.</p>}
        {status === "pending" && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        )}
        {status === "error" && <p className="text-sm text-destructive">The check failed — try again.</p>}
        {status === "success" && matches.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-success" data-testid="registration-duplicate-none">
            <CircleCheck aria-hidden className="size-4" /> No existing chart matches.
          </p>
        )}
        {status === "success" && matches.length > 0 && (
          <div className="space-y-3">
            <p className="flex items-start gap-2 text-sm font-medium text-warning">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {matches.length === 1 ? "1 possible duplicate" : `${matches.length} possible duplicates`} — review before creating a new chart.
            </p>
            <ul className="space-y-2">
              {matches.map((match) => (
                <li key={match.patient.id} className="space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3" data-testid="registration-duplicate-match">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{match.patient.displayName}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        <span className="font-mono">{match.patient.mrn}</span> · DOB {match.patient.dateOfBirth}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-warning/30 px-1.5 text-[11px] font-medium text-warning tabular-nums">
                      {Math.round(match.score * 100)}% match
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{match.reasons.join(" · ")}</p>
                  <div className="flex flex-wrap gap-2">
                    {onLink && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => onLink(match.patient.id)}
                        disabled={linkPending}
                        data-testid="registration-duplicate-link"
                      >
                        <Link2 aria-hidden /> Link referral to this chart
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="outline" render={<Link href={`/patients/${match.patient.id}`} />} nativeButton={false}>
                      Open chart
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
