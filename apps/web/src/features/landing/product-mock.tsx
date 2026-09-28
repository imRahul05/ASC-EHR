import type { Allergy, GapChip as GapChipModel, PatientRef, RuleResult } from "@asc/types";
import { AiBadge, DraftBanner, GapChip, GateChecklist, PatientBanner, PhaseStepper } from "@asc/ui";
import {
  CalendarDays,
  ClipboardList,
  FileText,
  Inbox,
  LayoutDashboard,
  Microscope,
  MonitorDot,
  Receipt,
  Search,
  UsersRound,
} from "@asc/ui/icons";

/** Synthetic sample data for the marketing screenshot (not a real person). */
const PATIENT: PatientRef = {
  id: "pat_demo",
  mrn: "MRN-204361",
  displayName: "Daniel Ortiz",
  initials: "DO",
  age: 59,
  sex: "M",
  dateOfBirth: "1966-11-23",
};
const ALLERGIES: readonly Allergy[] = [];

const DISCHARGE_GATE: RuleResult = {
  ok: false,
  reasons: [{ code: "NOTE", message: "Resolve 1 blocking gap before signing." }],
  checks: [
    { code: "ALDRETE", label: "Aldrete ≥ 9 (10/10)", ok: true },
    { code: "ESCORT", label: "Escort present", ok: true },
    { code: "INSTR", label: "Instructions approved", ok: true },
    { code: "NOTE", label: "Procedure note signed", ok: false },
  ],
};

const GAP: GapChipModel = { id: "gap_1", sectionId: "findings", message: "Jar B — polyp size not documented", blocking: true, resolved: false };

const NOTE_SECTIONS = [
  { title: "Indication", body: "Surveillance colonoscopy — tubular adenoma removed 2021." },
  { title: "Findings", body: "Cecum reached 08:19 (appendiceal orifice + ileocecal valve photographed). Withdrawal 9 min. Two sessile polyps: ascending 6 mm, sigmoid — size pending." },
  { title: "Specimens", body: "Jar A: ascending colon, cold snare. Jar B: sigmoid, cold snare." },
] as const;

const SIDEBAR = [LayoutDashboard, CalendarDays, MonitorDot, UsersRound, Inbox, ClipboardList, Receipt, Microscope] as const;
const TABS = ["Pre-procedure", "Pre-op", "Procedure", "Anesthesia", "Note", "Recovery", "Coding"] as const;
const ACTIVE_TAB = "Note";

/**
 * A static "screenshot" of the case workspace, composed from the real @asc/ui clinical kit.
 * Decorative (aria-hidden) — the page copy carries the meaning.
 */
export function ProductMock() {
  return (
    <div aria-hidden className="pointer-events-none overflow-hidden rounded-2xl border border-border bg-background shadow-sm select-none" data-testid="landing-product-mock">
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
        </span>
        <span className="mx-auto flex h-6 w-full max-w-xs items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[11px] text-muted-foreground">
          <Search className="size-3" /> Jump to patient, case or screen <span className="ml-auto font-mono">⌘K</span>
        </span>
      </div>

      <div className="flex">
        <nav className="hidden w-12 shrink-0 flex-col items-center gap-3 border-r border-border py-4 sm:flex">
          {SIDEBAR.map((Icon, index) => (
            <span key={index} className={index === 5 ? "rounded-md bg-accent p-1.5 text-primary" : "p-1.5 text-muted-foreground"}>
              <Icon className="size-4" />
            </span>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-3 p-3 sm:p-5">
          <PatientBanner
            patient={PATIENT}
            allergies={ALLERGIES}
            phase="RECOVERY"
            escort={{ name: "Lucia Ortiz", relationship: "Spouse", phone: "", confirmed: true, present: true }}
            meta={[<span key="case" className="font-mono">C-26-0103</span>, "Colonoscopy · Surveillance", "Room 2 · 08:00"]}
          />
          <div className="rounded-xl border border-border bg-card px-4 pt-3 pb-2">
            <PhaseStepper phase="RECOVERY" />
          </div>

          <div className="flex gap-4 overflow-hidden border-b border-border text-xs">
            {TABS.map((tab) => (
              <span key={tab} className={tab === ACTIVE_TAB ? "-mb-px border-b-2 border-primary pb-2 font-medium text-foreground" : "pb-2 text-muted-foreground"}>
                {tab}
              </span>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem]">
            <div className="space-y-3 rounded-xl border border-border bg-card p-3">
              <DraftBanner state="draft" meta="procedure_note@2.4 · 6.1 s" />
              {NOTE_SECTIONS.map((section) => (
                <div key={section.title} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <FileText className="size-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold">{section.title}</span>
                    <AiBadge label="AI" />
                  </div>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{section.body}</p>
                </div>
              ))}
              <GapChip chip={GAP} />
            </div>
            <div className="hidden space-y-3 rounded-xl border border-border bg-card p-3 lg:block">
              <GateChecklist result={DISCHARGE_GATE} title="Discharge gate" />
              <div className="h-8 rounded-lg bg-muted" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
