"use client";

import { useState } from "react";
import { formatDateTime } from "@asc/clinical-rules/time";
import type { ExtractedFact, Referral } from "@asc/types";
import { AiBadge, cn, ConfidenceBadge, confidenceTone, ProvenanceChip, SectionCard, SourceDocument } from "@asc/ui";
import { Info } from "@asc/ui/icons";
import { ReferralActions } from "./referral-actions";
import { ReferralStatusChip } from "./referral-status-chip";

interface ReferralDetailProps {
  readonly referral: Referral;
}

/** Low-confidence facts first ("exceptions first"), then document order. */
function reviewOrder(facts: readonly ExtractedFact[]): readonly ExtractedFact[] {
  const needsReview = facts.filter((fact) => confidenceTone(fact.confidence) !== "high");
  return [...needsReview, ...facts.filter((fact) => !needsReview.includes(fact))];
}

/** Fax preview beside the AI-extracted facts; hovering / focusing a fact highlights where it was read. */
export function ReferralDetail({ referral }: ReferralDetailProps) {
  const [activeFactId, setActiveFactId] = useState<string | null>(null);
  const facts = reviewOrder(referral.extractedFacts);
  const active = referral.extractedFacts.find((fact) => fact.id === activeFactId) ?? null;
  const reviewCount = referral.extractedFacts.filter((fact) => confidenceTone(fact.confidence) !== "high").length;

  return (
    <div className="space-y-4" data-testid="referral-detail">
      <SectionCard>
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">{referral.fromPractice}</h2>
                <ReferralStatusChip status={referral.status} priority={referral.priority} />
              </div>
              <p className="text-sm text-muted-foreground tabular-nums">
                {referral.fromProvider} · {referral.channel === "fax" ? "Fax" : "e-Referral"} · {referral.pageCount} p · received {formatDateTime(referral.receivedAt)}
              </p>
            </div>
          </div>
          <ReferralActions key={referral.id} referral={referral} />
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <SectionCard title="Document" description="OCR of the received fax." className="min-w-0" contentClassName="bg-muted/40 p-3 sm:p-5">
          <SourceDocument
            text={referral.documentText}
            highlight={active?.sourceSpan ?? null}
            header={
              <span className="truncate">
                FROM {referral.fromPractice} · {formatDateTime(referral.receivedAt)}
              </span>
            }
          />
        </SectionCard>

        <SectionCard
          title={
            <span className="flex items-center gap-2">
              Extracted facts <AiBadge label="AI draft" />
            </span>
          }
          description={reviewCount > 0 ? `${reviewCount} ${reviewCount === 1 ? "value needs" : "values need"} a closer look.` : "All values read with high confidence."}
          actions={<ProvenanceChip provenance={referral.provenance} />}
          contentClassName="p-0"
          data-testid="referral-facts"
        >
          <ul className="divide-y divide-border" onMouseLeave={() => setActiveFactId(null)}>
            {facts.map((fact) => {
              const isActive = fact.id === activeFactId;
              const flagged = confidenceTone(fact.confidence) !== "high";
              return (
                <li key={fact.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveFactId(fact.id)}
                    onFocus={() => setActiveFactId(fact.id)}
                    onBlur={() => setActiveFactId(null)}
                    onClick={() => setActiveFactId(isActive ? null : fact.id)}
                    aria-pressed={isActive}
                    aria-label={`${fact.label}: ${fact.value}. Show source in document`}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-2.5 text-left outline-none transition-colors motion-reduce:transition-none",
                      "hover:bg-accent focus-visible:bg-accent",
                      isActive && "bg-accent",
                      flagged && !isActive && "bg-warning/5",
                    )}
                    data-testid="referral-fact"
                  >
                    <span className="w-28 shrink-0 pt-px text-xs text-muted-foreground">{fact.label}</span>
                    <span className="min-w-0 flex-1 text-sm break-words">{fact.value}</span>
                    <ConfidenceBadge value={fact.confidence} />
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="flex items-start gap-1.5 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
            <Info aria-hidden className="mt-px size-3 shrink-0" />
            Drafts only — values are copied into registration for a human to verify. Nothing is saved automatically.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
