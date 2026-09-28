"use client";

import { useState } from "react";
import type { GapChip, NoteDraft } from "@asc/types";
import { GapChip as GapChipView, SectionCard } from "@asc/ui";
import { CircleCheck } from "@asc/ui/icons";
import { GapResolveForm } from "./gap-resolve-form";

interface ExceptionsPanelProps {
  readonly caseId: string;
  readonly note: NoteDraft;
  /** Resolution disabled (enrichment still running, or signed). */
  readonly locked: boolean;
}

/** Unresolved blocking first, then non-blocking, resolved last. */
function rank(chip: GapChip): number {
  if (chip.resolved) return 2;
  return chip.blocking ? 0 : 1;
}

/** Exceptions first (ui-guidelines §6): every gap-chip, blocking ones on top, resolvable inline. */
export function ExceptionsPanel({ caseId, note, locked }: ExceptionsPanelProps) {
  const [openChipId, setOpenChipId] = useState<string | null>(null);
  const chips = [...note.gapChips].sort((a, b) => rank(a) - rank(b));
  const blocking = chips.filter((chip) => chip.blocking && !chip.resolved).length;
  const open = chips.filter((chip) => !chip.resolved).length;

  return (
    <SectionCard
      title="Needs your attention"
      description={
        chips.length === 0
          ? "No documentation gaps found."
          : `${open} open · ${blocking} blocking signature${blocking === 1 ? "" : "s"}`
      }
      data-testid="note-exceptions"
    >
      {chips.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <CircleCheck aria-hidden className="size-4" /> Verification found no gaps.
        </p>
      ) : (
        <ul className="space-y-2">
          {chips.map((chip) => (
            <li key={chip.id}>
              <GapChipView chip={chip} onResolve={locked ? undefined : () => setOpenChipId(chip.id)} />
              {openChipId === chip.id && !chip.resolved && (
                <GapResolveForm
                  caseId={caseId}
                  chip={chip}
                  section={note.sections.find((section) => section.id === chip.sectionId)}
                  onDone={() => setOpenChipId(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
