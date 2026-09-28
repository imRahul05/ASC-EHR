import type { ReactNode } from "react"
import { cn } from "../../lib/utils"

export interface SourceHighlight {
  /** Character offsets into `text` (end exclusive). */
  readonly start: number
  readonly end: number
}

export interface SourceDocumentProps {
  /** OCR / document text; pages separated by `\f`. */
  readonly text: string
  /** Span to highlight (e.g. where an AI-extracted fact came from). */
  readonly highlight?: SourceHighlight | null
  /** Fax transmission header line (sender, time, page count). */
  readonly header?: ReactNode
  readonly className?: string
  readonly "data-testid"?: string
}

interface Segment {
  readonly text: string
  readonly marked: boolean
}

function segmentsOf(text: string, highlight: SourceHighlight | null | undefined): readonly Segment[] {
  if (!highlight || highlight.end <= highlight.start) return [{ text, marked: false }]
  return [
    { text: text.slice(0, highlight.start), marked: false },
    { text: text.slice(highlight.start, highlight.end), marked: true },
    { text: text.slice(highlight.end), marked: false },
  ]
}

/** Pages (split on form feed) with their start offset in the full text. */
function pagesOf(text: string): readonly { readonly text: string; readonly start: number }[] {
  return text.split("\f").reduce<{ readonly text: string; readonly start: number }[]>((pages, page) => {
    const previous = pages.at(-1)
    return [...pages, { text: page, start: previous ? previous.start + previous.text.length + 1 : 0 }]
  }, [])
}

/**
 * A scanned-document preview rendered as a paper page (no image) — the source for AI extraction.
 * Highlighting a span shows reviewers exactly where a value was read from.
 */
export function SourceDocument({ text, highlight, header, className, "data-testid": testId = "source-document" }: SourceDocumentProps) {
  const pages = pagesOf(text)
  return (
    <div data-testid={testId} className={cn("space-y-4", className)}>
      {pages.map(({ text: page, start: pageStart }, pageIndex) => {
        const local =
          highlight && highlight.start >= pageStart && highlight.end <= pageStart + page.length
            ? { start: highlight.start - pageStart, end: highlight.end - pageStart }
            : null
        return (
          <article
            key={pageIndex}
            aria-label={`Page ${pageIndex + 1} of ${pages.length}`}
            className="relative mx-auto aspect-[8.5/11] w-full max-w-xl overflow-hidden rounded-md border border-border bg-card shadow-sm"
          >
            {header && (
              <div className="flex items-center justify-between gap-2 border-b border-dashed border-border px-5 py-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                {header}
                <span className="shrink-0 tabular-nums">
                  P. {pageIndex + 1}/{pages.length}
                </span>
              </div>
            )}
            <p className="px-6 py-5 font-mono text-[12px] leading-6 whitespace-pre-wrap text-foreground/85 sm:px-8 sm:text-[13px]">
              {segmentsOf(page, local).map((segment, index) =>
                segment.marked ? (
                  <mark
                    key={index}
                    data-testid="source-document-highlight"
                    className="rounded-sm bg-ai px-0.5 text-ai-foreground ring-1 ring-ai-border transition-colors motion-reduce:transition-none"
                  >
                    {segment.text}
                  </mark>
                ) : (
                  <span key={index}>{segment.text}</span>
                )
              )}
            </p>
          </article>
        )
      })}
    </div>
  )
}
