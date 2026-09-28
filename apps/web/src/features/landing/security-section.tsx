import { FileLock2, KeyRound, Link2Off, ScrollText, ServerCog, ShieldCheck, type LucideIcon } from "@asc/ui/icons";
import { SectionHeading } from "./section-heading";

const CONTROLS: readonly { readonly icon: LucideIcon; readonly title: string; readonly body: string }[] = [
  { icon: ScrollText, title: "Audit on every access", body: "Reads and writes land in an append-only AuditEvent trail — who, what, when, from which role." },
  { icon: FileLock2, title: "BAA-covered AI only", body: "PHI routes only to models under a Business Associate Agreement. No provider-side retention." },
  { icon: Link2Off, title: "PHI never in URLs", body: "Routes carry IDs only. No PHI in page titles, logs, analytics or browser storage." },
  { icon: KeyRound, title: "Least-privilege roles", body: "Front desk, nursing, physicians, anesthesia and patients each see what their job needs." },
  { icon: ServerCog, title: "FHIR at the core", body: "Clinical data lives as FHIR resources — portable, standard, and yours to export." },
  { icon: ShieldCheck, title: "Human in the loop", body: "Gates and sign-offs are enforced server-side, not just in the UI." },
];

/** HIPAA / security posture as a quiet two-column list. */
export function SecuritySection() {
  return (
    <section id="security" aria-labelledby="security-title" className="scroll-mt-20 border-t border-border">
      <div className="mx-auto grid max-w-6xl grid-cols-1 [&>*]:min-w-0 gap-14 px-4 py-24 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <SectionHeading
          id="security-title"
          eyebrow="Security & HIPAA"
          title="Built like the auditor is watching."
          description="Compliance is part of the architecture, not a checklist at the end — the same rules run in the UI for instant feedback and on the server as the source of truth."
        />
        <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {CONTROLS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="space-y-2 border-t border-border pt-5">
              <Icon aria-hidden className="size-5 text-muted-foreground" />
              <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
