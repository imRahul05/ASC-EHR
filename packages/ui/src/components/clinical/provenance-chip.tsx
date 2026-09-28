"use client"

import { formatDateTime } from "@asc/clinical-rules/time"
import type { AiProvenance } from "@asc/types"
import { Info, Sparkles, UserPen } from "lucide-react"
import { cn } from "../../lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip"

export interface ProvenanceChipProps {
  readonly provenance: AiProvenance
  /** Name of the clinician who edited the AI value, if any. */
  readonly editedBy?: string
  readonly className?: string
}

/** "Where did this come from?" — agent, prompt version and time on hover/focus. */
export function ProvenanceChip({ provenance, editedBy, className }: ProvenanceChipProps) {
  const Icon = editedBy ? UserPen : Sparkles
  return (
    <Tooltip>
      <TooltipTrigger
        data-testid="provenance-chip"
        className={cn(
          "inline-flex h-5 items-center gap-1 rounded-full border border-border bg-background px-2 text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40",
          className
        )}
      >
        <Icon aria-hidden className="size-3" />
        {editedBy ? `Edited by ${editedBy}` : provenance.agent.replaceAll("_", " ")}
        <Info aria-hidden className="size-3 opacity-60" />
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex-col items-start gap-0.5">
        <span className="font-medium">AI agent: {provenance.agent}</span>
        <span>Prompt {provenance.promptVersion}</span>
        {provenance.model && <span>{provenance.model}</span>}
        <span>Generated {formatDateTime(provenance.generatedAt)}</span>
        {editedBy && <span>Edited by {editedBy}</span>}
      </TooltipContent>
    </Tooltip>
  )
}
