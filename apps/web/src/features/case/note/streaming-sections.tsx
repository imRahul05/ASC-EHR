import type { NoteSectionId } from "@asc/types";
import { AiBadge, cn, SectionCard, Skeleton } from "@asc/ui";
import { NOTE_SECTIONS } from "./note-pipeline";

interface StreamedSection {
  readonly id: NoteSectionId;
  readonly title: string;
  readonly content: string;
  readonly complete: boolean;
}

interface StreamingSectionsProps {
  readonly sections: readonly StreamedSection[];
}

/**
 * Sections appear progressively as the stream arrives. Screen readers get one polite announcement per
 * completed section (not every token); the visible text streams underneath.
 */
export function StreamingSections({ sections }: StreamingSectionsProps) {
  const completed = sections.filter((section) => section.complete);
  const current = sections.find((section) => !section.complete);
  return (
    <SectionCard title="Procedure note" actions={<AiBadge label="AI writing" />} data-testid="note-streaming-sections">
      <p role="status" aria-live="polite" className="sr-only">
        {current ? `Writing ${current.title}. ` : ""}
        {completed.length} of {NOTE_SECTIONS.length} sections complete.
      </p>
      <ol className="space-y-5" aria-busy="true">
        {NOTE_SECTIONS.map(({ id, title }) => {
          const section = sections.find((item) => item.id === id);
          return (
            <li key={id} data-testid={`note-stream-section-${id}`} data-state={section ? (section.complete ? "complete" : "streaming") : "pending"}>
              <h3 className={cn("text-sm font-semibold", !section && "text-muted-foreground")}>{title}</h3>
              {section ? (
                <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">
                  {section.content}
                  {!section.complete && (
                    <span aria-hidden className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 rounded-sm bg-ai-foreground motion-safe:animate-pulse" />
                  )}
                </p>
              ) : (
                <div className="mt-2 space-y-1.5" aria-hidden>
                  <Skeleton className="h-3 w-full max-w-xl" />
                  <Skeleton className="h-3 w-2/3 max-w-md" />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}
