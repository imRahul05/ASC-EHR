import type { GapChip as GapChipModel } from "@asc/types";
import { AiBadge, Button, ConfidenceBadge, DraftBanner, GapChip } from "@asc/ui";
import { Fingerprint, FileSignature, PenLine, Sparkles, type LucideIcon } from "@asc/ui/icons";
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

const FACTS = [
  { label: "Patient name", value: "Frank Delaney", confidence: 0.98 },
  { label: "Member ID", value: "7XK2-TE4-MR91", confidence: 0.83 },
  { label: "Medications", value: "warfarin 5 mg daily (AFib)", confidence: 0.88 },
] as const;

const GAP: GapChipModel = { id: "g", sectionId: "findings", message: "BBPS not documented", blocking: true, resolved: false };

/** AI principles + a small composed example (extraction, confidence, a blocking gap, a disabled sign button). */
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

        <div aria-hidden className="pointer-events-none space-y-3 rounded-2xl border border-border bg-muted/40 p-3 select-none sm:p-5">
          <div className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Referral · extracted facts</span>
              <AiBadge label="referral_extraction@1.3" />
            </div>
            <ul className="divide-y divide-border">
              {FACTS.map((fact) => (
                <li key={fact.label} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">{fact.label}</span>
                  <span className="min-w-0 flex-1 truncate">{fact.value}</span>
                  <ConfidenceBadge value={fact.confidence} />
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-xs">
            <DraftBanner state="draft" />
            <GapChip chip={GAP} />
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="size-3.5" /> 8 sections drafted in 6.1 s
              </span>
              <Button size="sm" disabled>
                <FileSignature /> Sign note
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
