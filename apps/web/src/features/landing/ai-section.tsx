import { Fingerprint, FileSignature, PenLine, type LucideIcon } from "@asc/ui/icons";
import { AiSectionExample } from "./ai-section-example";
import { SectionHeading } from "./section-heading";

const PRINCIPLES: readonly { readonly icon: LucideIcon; readonly title: string; readonly body: string }[] = [
  {
    icon: PenLine,
    title: "Draft-first",
    body: "Every AI value arrives marked as a draft — in the note, the codes, the discharge instructions. Clinicians accept, edit or reject; their edits always win.",
  },
  {
    icon: Fingerprint,
    title: "Provenance on every value",
    body: "Hover any AI value for the agent, prompt version and time. Extracted facts highlight the exact line of the fax; codes link to the sentence that justifies them.",
  },
  {
    icon: FileSignature,
    title: "Never auto-signs",
    body: "Sign, attest, discharge and send belong to a person. Blocking gaps disable the button — with the reason — until someone resolves them.",
  },
];

/** AI principles + an interactive example (provenance on hover, a blocking gap that gates signing). */
export function AiSection() {
  return (
    <section id="ai" aria-labelledby="ai-title" className="scroll-mt-20 border-t border-border">
      <div className="mx-auto grid max-w-6xl grid-cols-1 [&>*]:min-w-0 items-center gap-14 px-4 py-24 sm:px-6 lg:grid-cols-2">
        <div className="space-y-10">
          <SectionHeading
            id="ai-title"
            eyebrow="AI, held to clinical standards"
            title="The AI does the typing. The clinician keeps the pen."
            description="Agents run behind a BAA-covered gateway with PHI-aware routing — and every output is reviewable before it becomes part of the record."
          />
          <ul className="space-y-6">
            {PRINCIPLES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-ai-border bg-ai text-ai-foreground">
                  <Icon aria-hidden className="size-4" />
                </span>
                <div className="space-y-1">
                  <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <AiSectionExample />
      </div>
    </section>
  );
}
