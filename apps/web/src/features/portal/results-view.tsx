import { formatDate, formatDateTime } from "@asc/clinical-rules/time";
import type { MyCare } from "@asc/types";
import { EmptyState, SectionCard } from "@asc/ui";
import { CalendarCheck, FileHeart, Mail } from "@asc/ui/icons";

interface ResultsViewProps {
  readonly care: MyCare;
}

/** After the procedure: approved discharge instructions, result letters and next-colonoscopy date. */
export function ResultsView({ care }: ResultsViewProps) {
  const { instructions, letters, surveillance } = care;
  if (!instructions && letters.length === 0 && !surveillance) {
    return (
      <EmptyState
        icon={FileHeart}
        title="Nothing here yet"
        description="After your procedure, your care instructions appear here first, then your results letter (usually within a week)."
      />
    );
  }

  return (
    <div className="space-y-4" data-testid="portal-results">
      {surveillance && (
        <SectionCard contentClassName="flex items-center gap-4 p-5">
          <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <CalendarCheck className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm text-muted-foreground">Your next colonoscopy</p>
            <p className="text-lg font-semibold">
              In {surveillance.intervalYears} years · around {formatDate(surveillance.dueDate)}
            </p>
            <p className="text-xs text-muted-foreground">We'll send you a reminder.</p>
          </div>
        </SectionCard>
      )}
      {letters.length > 0 && (
        <SectionCard title="Your results" description="From your care team" data-testid="portal-letters">
          <ul className="space-y-3">
            {letters.map((letter) => (
              <li key={letter.id} className="flex gap-3 rounded-lg border border-border/70 p-3">
                <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <p className="text-sm">{letter.summary}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(letter.sentAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
      {instructions && (
        <SectionCard
          title="Going home: your care instructions"
          description={instructions.approvedAt ? `Reviewed by your nurse · ${formatDateTime(instructions.approvedAt)}` : undefined}
          data-testid="portal-instructions"
        >
          <div className="space-y-4">
            {instructions.sections.map((section) => (
              <section key={section.title}>
                <h3 className="text-sm font-semibold">{section.title}</h3>
                <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">{section.body}</p>
              </section>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
