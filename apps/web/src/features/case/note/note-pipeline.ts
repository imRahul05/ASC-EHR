import type { NoteDraft, NoteSectionId } from "@asc/types";
import type { PipelineStep, PipelineStepStatus } from "@asc/ui";

/** Section order of the procedure note (the stream sends them in this order). */
export const NOTE_SECTIONS: readonly { readonly id: NoteSectionId; readonly title: string }[] = [
  { id: "indication", title: "Indication" },
  { id: "consent", title: "Consent" },
  { id: "sedation", title: "Sedation" },
  { id: "procedure", title: "Procedure" },
  { id: "findings", title: "Findings" },
  { id: "impression", title: "Impression" },
  { id: "recommendations", title: "Recommendations" },
  { id: "quality", title: "Quality measures" },
];

type GenerationStatus = "idle" | "streaming" | "draft_ready" | "completed" | "failed" | "cancelled";

interface PipelineInput {
  readonly status: GenerationStatus;
  readonly sectionsDone: number;
  readonly note: NoteDraft | null;
  readonly codingSuggestionCount: number | null;
}

/**
 * Draft-first pipeline (MindScript §4.2, docs/product/04 §4): generation → verification → draft saved,
 * then critic / coding / guideline branches in parallel → final status. Derived from stream events only.
 */
export function notePipelineSteps({ status, sectionsDone, note, codingSuggestionCount }: PipelineInput): readonly PipelineStep[] {
  const total = NOTE_SECTIONS.length;
  const terminal = status === "failed" || status === "cancelled";
  const running = status === "streaming" || terminal;
  const drafted = status === "draft_ready" || status === "completed" || (terminal && note !== null);
  const done = status === "completed";
  const criticSeen = (note?.criticSuggestions.length ?? 0) > 0 || codingSuggestionCount !== null;
  const gaps = note?.gapChips.length ?? 0;

  const raw: readonly (Omit<PipelineStep, "status"> & { readonly status: PipelineStepStatus })[] = [
    {
      id: "generation",
      label: "Note generation",
      hint: `${Math.min(sectionsDone, total)}/${total} sections streamed`,
      status: drafted || sectionsDone >= total ? "done" : running ? "active" : "pending",
    },
    {
      id: "verification",
      label: "Code-based verification",
      hint: "Events, specimens and doses cross-checked",
      status: drafted ? "done" : sectionsDone >= total ? "active" : "pending",
    },
    { id: "draft", label: "Draft ready for review", hint: "You can read it while checks finish", status: drafted ? "done" : "pending" },
    {
      id: "critic",
      group: "branches",
      label: "Critic & gap check",
      hint: drafted ? `${gaps} gap${gaps === 1 ? "" : "s"} · never overwrites your edits` : undefined,
      status: criticSeen || done ? "done" : drafted ? "active" : "pending",
    },
    {
      id: "coding",
      group: "branches",
      label: "Coding suggestions",
      hint: codingSuggestionCount !== null ? `${codingSuggestionCount} CPT/ICD suggestions` : undefined,
      status: codingSuggestionCount !== null || done ? "done" : drafted ? "active" : "pending",
    },
    {
      id: "guideline",
      group: "branches",
      label: "Guideline advisor",
      hint: done ? "Surveillance set after pathology" : undefined,
      status: done ? "done" : drafted ? "active" : "pending",
    },
    { id: "completed", label: "Completed · awaiting signature", status: done ? "done" : "pending" },
  ];

  if (!terminal) return raw;
  // Terminal failure: the running step failed, everything not reached is skipped.
  return raw.map((step) => ({
    ...step,
    status: step.status === "active" ? "failed" : step.status === "pending" ? "skipped" : step.status,
  }));
}
