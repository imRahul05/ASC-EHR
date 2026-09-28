import { Kbd, SectionCard } from "@asc/ui";
import { ChevronRight } from "@asc/ui/icons";
import { FAQ, SHORTCUTS } from "./guide-content";

/** Keyboard shortcuts + FAQ (native <details>: keyboard and screen-reader friendly, no state). */
export function GuideReference() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <SectionCard title="Keyboard shortcuts" data-testid="guide-shortcuts">
        <ul className="space-y-3">
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.id} className="flex items-start justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{shortcut.label}</span>
              <span className="flex shrink-0 gap-1">
                {shortcut.keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Questions" contentClassName="p-0" data-testid="guide-faq">
        <div className="divide-y divide-border/70">
          {FAQ.map((item) => (
            <details key={item.id} className="group px-4 py-3" data-testid={`guide-faq-${item.id}`}>
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
                {item.q}
              </summary>
              <p className="mt-2 pl-5.5 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
