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
import { SectionHeading } from "./section-heading";

const MODULES: readonly { readonly icon: LucideIcon; readonly title: string; readonly body: string }[] = [
  { icon: Inbox, title: "Referral inbox", body: "Fax OCR, extracted facts with source highlights, duplicate match." },
  { icon: CalendarDays, title: "Scheduling", body: "Room time-grid, block templates, conflict and eligibility checks." },
  { icon: MonitorDot, title: "Live whiteboard", body: "Every case by phase, initials only, safe for the hallway screen." },
  { icon: ClipboardCheck, title: "Pre-op & H&P", body: "Medication holds, ASA, consents with signature, readiness gate." },
  { icon: Activity, title: "Procedure room", body: "Glove-friendly taps, multi-role time-out, specimen jars, images." },
  { icon: Syringe, title: "Anesthesia record", body: "5-minute vitals flowsheet, drug doses, airway events." },
  { icon: FileText, title: "AI procedure note", body: "Streamed draft, gap chips, critic suggestions, human sign-off." },
  { icon: HeartPulse, title: "PACU & discharge", body: "Aldrete and PADSS, escort check, plain-language instructions." },
  { icon: Receipt, title: "Coding & charges", body: "Evidence-linked CPT / ICD-10, coder attestation, 837P export." },
  { icon: Microscope, title: "Pathology & recall", body: "Jar-level reconciliation, adenoma detection, surveillance letters." },
  { icon: HeartHandshake, title: "Patient portal", body: "Prep checklist, NPO timing, escort details, results." },
  { icon: ChartLine, title: "Quality", body: "ADR, cecal intubation, withdrawal time, BBPS, turnaround." },
];

/** Module grid with hairline dividers (gap-px on a border-coloured grid). */
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
        <ul className="grid overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3 gap-px [&>li]:bg-card">
          {MODULES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="space-y-2 p-6">
              <Icon aria-hidden className="size-5 text-muted-foreground" />
              <h3 className="pt-2 text-[15px] font-semibold tracking-tight">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
