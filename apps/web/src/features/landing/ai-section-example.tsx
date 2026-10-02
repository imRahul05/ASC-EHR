"use client";

import type { GapChip as GapChipModel } from "@asc/types";
import { AiBadge } from "@asc/ui/components/clinical/ai-badge";
import { ConfidenceBadge } from "@asc/ui/components/clinical/confidence-badge";
import { DraftBanner } from "@asc/ui/components/clinical/draft-banner";
import { GapChip } from "@asc/ui/components/clinical/gap-chip";
import { Button } from "@asc/ui/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@asc/ui/components/ui/tooltip";
import { cn } from "@asc/ui/lib/utils";
import { FileSignature, RotateCcw, Sparkles } from "@asc/ui/icons";
import { useState, type MouseEvent } from "react";

// Synthetic demo data only — no real patient, nothing leaves the page.
const AGENT = "referral_extraction@1.3";
const PROMPT_VERSION = "v1.3.2";
const GENERATED_AT = "08:02";

const FACTS = [
  { label: "Patient name", value: "Frank Delaney", confidence: 0.98, line: 4 },
  { label: "Member ID", value: "7XK2-TE4-MR91", confidence: 0.83, line: 9 },
  { label: "Medications", value: "warfarin 5 mg daily (AFib)", confidence: 0.88, line: 17 },
] as const;

const GAP: GapChipModel = { id: "g", sectionId: "findings", message: "BBPS not documented", blocking: true, resolved: false };
const RESOLVED_GAP: GapChipModel = { ...GAP, resolved: true, resolution: "BBPS 8 (3/3/2) added by clinician" };

const REASON_ID = "ai-example-sign-reason";

/** Tap (touch) toggles the provenance tooltip; mouse and keyboard use hover / focus. */
function isTouchClick(event: MouseEvent) {
  const native = event.nativeEvent;
  return "pointerType" in native && native.pointerType === "touch";
}

/** Extracted facts; hovering, focusing or tapping a row shows its provenance. */
function ExtractedFacts() {
  const [openFact, setOpenFact] = useState<string | null>(null);
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">Referral · extracted facts</span>
        <AiBadge label={AGENT} />
      </div>
      <ul className="divide-y divide-border">
        {FACTS.map((fact) => (
          <li key={fact.label}>
            <Tooltip
              open={openFact === fact.label}
              onOpenChange={(open) => setOpenFact((prev) => (open ? fact.label : prev === fact.label ? null : prev))}
            >
              <TooltipTrigger
                closeOnClick={false}
                onClick={(event) => {
                  if (isTouchClick(event)) setOpenFact((prev) => (prev === fact.label ? null : fact.label));
                }}
                className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-2 text-left text-sm outline-none transition-colors hover:bg-ai/60 focus-visible:ring-3 focus-visible:ring-ring/40 data-popup-open:bg-ai/60 motion-reduce:transition-none"
              >
                <span className="w-28 shrink-0 text-xs text-muted-foreground">{fact.label}</span>
                <span className="min-w-0 flex-1 truncate">{fact.value}</span>
                <ConfidenceBadge value={fact.confidence} />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="flex-col items-start gap-0.5">
                <span className="font-medium">AI agent: {AGENT}</span>
                <span>Prompt {PROMPT_VERSION}</span>
                <span>Generated {GENERATED_AT}</span>
                <span>Source: fax p.2, line {fact.line}</span>
              </TooltipContent>
            </Tooltip>
          </li>
        ))}
      </ul>
    </div>
  );
}

type SignStage = "blocked" | "ready" | "signed";

const STATUS: Record<SignStage, string> = {
  blocked: "Resolve 1 blocking gap to sign",
  ready: "8 sections drafted in 6.1 s",
  signed: "Signed by Dr. A. Rivera (demo) · 08:14",
};

/** Gap → sign flow: resolving the blocking gap enables "Sign note"; signing is local state only. */
function SignFlow() {
  const [stage, setStage] = useState<SignStage>("blocked");
  const signed = stage === "signed";
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-xs">
      <DraftBanner
        state={signed ? "signed" : "draft"}
        message={signed ? "Signed and locked (demo — nothing was sent)." : undefined}
        className="motion-safe:transition-colors"
      />
      <GapChip
        chip={stage === "blocked" ? GAP : RESOLVED_GAP}
        onResolve={() => setStage("ready")}
        className="transition-colors motion-reduce:transition-none"
      />
      <div className="flex items-center justify-between gap-3 pt-1">
        <span
          id={REASON_ID}
          className={cn(
            "flex min-w-0 items-center gap-1.5 text-xs",
            stage === "blocked" ? "text-destructive" : signed ? "text-success" : "text-muted-foreground"
          )}
        >
          {!signed && <Sparkles aria-hidden className="size-3.5 shrink-0" />}
          <span className="truncate">{STATUS[stage]}</span>
        </span>
        {signed ? (
          <Button size="sm" variant="ghost" onClick={() => setStage("blocked")}>
            <RotateCcw /> Reset
          </Button>
        ) : (
          <Button size="sm" disabled={stage === "blocked"} aria-describedby={REASON_ID} onClick={() => setStage("signed")}>
            <FileSignature /> Sign note
          </Button>
        )}
      </div>
    </div>
  );
}

/** Interactive AI draft review card for the landing AI section (synthetic data, local state only). */
export function AiSectionExample() {
  return (
    <div
      role="group"
      aria-label="Interactive example: AI draft review"
      className="space-y-3 rounded-2xl border border-border bg-muted/40 p-3 sm:p-5"
    >
      <ExtractedFacts />
      <SignFlow />
    </div>
  );
}
