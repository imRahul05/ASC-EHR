import {
  Activity,
  CalendarDays,
  ChartLine,
  ClipboardCheck,
  FileText,
  HeartHandshake,
  HeartPulse,
  Inbox,
  Microscope,
  MonitorDot,
  Receipt,
  Syringe,
  type LucideIcon,
} from "@asc/ui/icons";
import { ModulesSpotlightList } from "./modules-spotlight";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

/** Workflow steps a module belongs to; `anchor` is the step's DOM id in `workflow-section.tsx`. */
const STEPS = {
  referral: { label: "Step 01 · Referral", anchor: "step-referral" },
  schedule: { label: "Step 02 · Schedule", anchor: "step-schedule" },
  preop: { label: "Step 03 · Pre-op", anchor: "step-preop" },
  procedure: { label: "Step 04 · Procedure", anchor: "step-procedure" },
  pacu: { label: "Step 05 · PACU", anchor: "step-pacu" },
  coding: { label: "Step 06 · Coding", anchor: "step-coding" },
  pathology: { label: "Step 07 · Pathology", anchor: "step-pathology" },
} as const;

const MODULES: readonly {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
  readonly step?: keyof typeof STEPS;
}[] = [
  { icon: Inbox, title: "Referral inbox", body: "Fax OCR, extracted facts with source highlights, duplicate match.", step: "referral" },
  { icon: CalendarDays, title: "Scheduling", body: "Room time-grid, block templates, conflict and eligibility checks.", step: "schedule" },
  { icon: MonitorDot, title: "Live whiteboard", body: "Every case by phase, initials only, safe for the hallway screen." },
  { icon: ClipboardCheck, title: "Pre-op & H&P", body: "Medication holds, ASA, consents with signature, readiness gate.", step: "preop" },
  { icon: Activity, title: "Procedure room", body: "Glove-friendly taps, multi-role time-out, specimen jars, images.", step: "procedure" },
  { icon: Syringe, title: "Anesthesia record", body: "5-minute vitals flowsheet, drug doses, airway events." },
  { icon: FileText, title: "AI procedure note", body: "Streamed draft, gap chips, critic suggestions, human sign-off.", step: "procedure" },
  { icon: HeartPulse, title: "PACU & discharge", body: "Aldrete and PADSS, escort check, plain-language instructions.", step: "pacu" },
  { icon: Receipt, title: "Coding & charges", body: "Evidence-linked CPT / ICD-10, coder attestation, 837P export.", step: "coding" },
  { icon: Microscope, title: "Pathology & recall", body: "Jar-level reconciliation, adenoma detection, surveillance letters.", step: "pathology" },
  { icon: HeartHandshake, title: "Patient portal", body: "Prep checklist, NPO timing, escort details, results." },
  { icon: ChartLine, title: "Quality", body: "ADR, cecal intubation, withdrawal time, BBPS, turnaround." },
];

/**
 * Pointer spotlight: a radial gradient at `--mx`/`--my` (set by `ModulesSpotlightList`) on a
 * `before:` layer behind the card content. Tailwind's `hover:` only matches hover-capable pointers.
 */
const SPOTLIGHT =
  "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:opacity-0 before:transition-opacity before:duration-300 before:bg-[radial-gradient(280px_circle_at_var(--mx,50%)_var(--my,50%),color-mix(in_oklab,var(--color-primary)_12%,transparent),transparent_70%)] hover:before:opacity-100 motion-reduce:before:transition-none";

/**
 * Module grid with hairline dividers (gap-px on a border-coloured grid). Cards light up on
 * hover / keyboard focus; modules that belong to a workflow step link to it.
 */
export function ModulesSection() {
  return (
    <section aria-labelledby="modules-title" className="border-t border-border bg-muted/30">
      <div className="mx-auto max-w-6xl space-y-14 px-4 py-24 sm:px-6">
        <SectionHeading
          id="modules-title"
          eyebrow="Modules"
          title="Everything a GI center runs on — built for endoscopy, not bolted on."
          description="Twelve modules on one data model. Swap your fax queue, scheduling book, paper flowsheet and coding spreadsheet for a single record."
        />
        <Reveal>
          <ModulesSpotlightList className="grid overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3 gap-px [&>li]:bg-card">
            {MODULES.map(({ icon: Icon, title, body, step }) => (
              <li
                key={title}
                className={`group relative isolate space-y-2 p-6 transition-colors duration-300 hover:bg-(--card-lift) focus-within:bg-(--card-lift) [--card-lift:color-mix(in_oklab,var(--color-accent)_45%,var(--color-card))] motion-reduce:transition-none ${SPOTLIGHT}`}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Negative margin keeps the icon where it was; the tile only shows on hover/focus. */}
                  <span className="-m-2 flex rounded-lg p-2 text-muted-foreground transition-colors group-focus-within:bg-primary/10 group-focus-within:text-primary group-hover:bg-primary/10 group-hover:text-primary">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  {step && (
                    <a
                      href={`#${STEPS[step].anchor}`}
                      className="-my-0.5 shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:border-primary/40 focus-visible:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none"
                    >
                      {STEPS[step].label}
                    </a>
                  )}
                </div>
                <h3 className="pt-2 text-[15px] font-semibold tracking-tight">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
              </li>
            ))}
          </ModulesSpotlightList>
        </Reveal>
      </div>
    </section>
  );
}
