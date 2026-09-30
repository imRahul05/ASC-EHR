import type { CasePhase } from "@asc/types";
import { AiBadge, PhaseChip } from "@asc/ui";
import {
  CalendarCheck,
  ClipboardCheck,
  FileInput,
  HeartPulse,
  Microscope,
  Receipt,
  RotateCcw,
  Stethoscope,
  type LucideIcon,
} from "@asc/ui/icons";
import { JOURNEY_STOPS } from "./landing-journey";
import { SectionHeading } from "./section-heading";
import { WorkflowScrollSpy, WorkflowStepItem } from "./workflow-scroll-spy";

const STEPS: readonly {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
  readonly who: string;
  readonly phase: CasePhase;
  readonly ai?: string;
}[] = [
  {
    icon: FileInput,
    title: "Referral",
    body: "Faxes land in an inbox. Name, DOB, payer, meds and the ask are extracted with a highlight back to the page they came from.",
    who: "Front desk",
    phase: "SCHEDULED",
    ai: "Extraction",
  },
  {
    icon: CalendarCheck,
    title: "Schedule",
    body: "Book by room, time and team with a live conflict check. Eligibility runs as a 270/271 before the case is confirmed.",
    who: "Scheduler",
    phase: "CONFIRMED",
  },
  {
    icon: ClipboardCheck,
    title: "Pre-op",
    body: "H&P, anticoagulant and GLP-1 holds, consents and escort roll into one readiness gate — nothing moves until it's green.",
    who: "Pre-op RN",
    phase: "READY_FOR_PROCEDURE",
    ai: "Pre-visit brief",
  },
  {
    icon: Stethoscope,
    title: "Procedure + note",
    body: "Room-mode taps for cecum, withdrawal and specimens. The procedure note streams in as a draft the physician reviews and signs.",
    who: "Gastroenterologist",
    phase: "IN_PROCEDURE",
    ai: "Note draft",
  },
  {
    icon: HeartPulse,
    title: "PACU",
    body: "Aldrete scoring, escort present, instructions drafted in plain language — the discharge gate enforces all three.",
    who: "PACU RN",
    phase: "RECOVERY",
    ai: "Instructions",
  },
  {
    icon: Receipt,
    title: "Coding",
    body: "CPT, ICD-10 and modifiers suggested with evidence links into the note. A coder attests; charges export as 837P.",
    who: "Coder",
    phase: "CODED",
    ai: "Code suggestions",
  },
  {
    icon: Microscope,
    title: "Pathology loop",
    body: "Results reconcile to each jar, adenomas set the surveillance interval, and the letter goes out before the case closes.",
    who: "Gastroenterologist",
    phase: "CLOSED",
  },
];

/** The whole patient journey as one ordered list; the step at the viewport middle is highlighted as the reader scrolls. */
export function WorkflowSection() {
  return (
    <section id="workflow" aria-labelledby="workflow-title" className="scroll-mt-20 border-t border-border">
      <div className="mx-auto grid max-w-6xl grid-cols-1 [&>*]:min-w-0 gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeading
            id="workflow-title"
            eyebrow="One patient journey"
            title="Seven hand-offs. One record. No re-typing."
            description="Every step writes to the same case, so the next person starts with what the last one knew — and a phase machine makes sure nobody skips a gate."
          />
        </div>
        <WorkflowScrollSpy className="relative space-y-2">
          {STEPS.map((step, index) => (
            <WorkflowStepItem
              key={step.title}
              id={JOURNEY_STOPS[index].stepAnchor}
              index={index}
              className="relative grid scroll-mt-24 grid-cols-[2.5rem_minmax(0,1fr)] gap-4 rounded-2xl p-4 transition-colors hover:bg-muted/50 data-[state=active]:bg-muted/40 motion-reduce:transition-none"
            >
              {/* Connector to the next step; fills with primary once this step is behind the reader. */}
              {index < STEPS.length - 1 && (
                <span aria-hidden className="absolute top-14 bottom-[-0.75rem] left-[2.2rem] w-px overflow-hidden bg-border">
                  <span className="block size-full origin-top scale-y-0 bg-primary transition-transform duration-500 ease-out group-data-[state=done]/step:scale-y-100 motion-reduce:transition-none" />
                </span>
              )}
              <span className="relative flex size-10 items-center justify-center rounded-xl border border-border bg-card shadow-xs transition-colors duration-300 group-data-[state=active]/step:border-primary/40 group-data-[state=active]/step:bg-primary/10 group-data-[state=active]/step:text-primary motion-reduce:transition-none">
                <step.icon aria-hidden className="size-4" />
              </span>
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                  <h3 className="text-base font-semibold tracking-tight">{step.title}</h3>
                  {step.ai && <AiBadge label={step.ai} />}
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                  <span>{step.who}</span>
                  <span aria-hidden>·</span>
                  <PhaseChip phase={step.phase} />
                </div>
              </div>
            </WorkflowStepItem>
          ))}
          <li className="flex items-center gap-2 px-4 pt-2 text-sm text-muted-foreground">
            <RotateCcw aria-hidden className="size-4" /> Surveillance due dates feed the next referral — the loop closes itself.
          </li>
        </WorkflowScrollSpy>
      </div>
    </section>
  );
}
