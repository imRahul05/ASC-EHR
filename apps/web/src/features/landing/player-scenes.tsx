import type { Allergy, GapChip as GapChipModel, PatientRef, RuleResult } from "@asc/types";
import {
  AiBadge,
  cn,
  ConfidenceBadge,
  DraftBanner,
  GapChip,
  GateChecklist,
  PatientBanner,
  PhaseStepper,
} from "@asc/ui";
import {
  Activity,
  CheckCircle2,
  FileCheck2,
  FileSignature,
  FileText,
  Microscope,
  Receipt,
  ScanLine,
  Sparkles,
} from "@asc/ui/icons";

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

const PREOP_GATE: RuleResult = {
  ok: true,
  reasons: [],
  checks: [
    { code: "HP", label: "H&P updated (< 30 days)", ok: true },
    { code: "HOLD", label: "Warfarin held 5 days (INR 1.1)", ok: true },
    { code: "NPO", label: "NPO since midnight verified", ok: true },
    { code: "CONSENT", label: "Informed consent e-signed", ok: true },
    { code: "ESCORT", label: "Escort present (Lucia Ortiz)", ok: true },
  ],
};

const DISCHARGE_GATE: RuleResult = {
  ok: true,
  reasons: [],
  checks: [
    { code: "ALDRETE", label: "Aldrete ≥ 9 (10/10)", ok: true },
    { code: "ESCORT", label: "Escort verified present", ok: true },
    { code: "INSTR", label: "Bilingual instructions approved", ok: true },
    { code: "NOTE", label: "Procedure note signed", ok: true },
  ],
};

const GAP_RESOLVED: GapChipModel = {
  id: "gap_1",
  sectionId: "findings",
  message: "Jar B — polyp size documented (6 mm)",
  blocking: false,
  resolved: true,
};

const NOTE_SECTIONS = [
  { title: "Indication", body: "Surveillance colonoscopy — tubular adenoma removed 2021." },
  {
    title: "Findings",
    body: "Cecum reached 08:19 (appendiceal orifice + ileocecal valve photographed). Withdrawal 9 min. Two sessile polyps: ascending 6 mm (Jar A), sigmoid 6 mm (Jar B).",
  },
  { title: "Specimens", body: "Jar A: ascending colon, cold snare. Jar B: sigmoid, cold snare." },
] as const;

interface SceneProps {
  readonly progress: number;
}

/** Scene 0: Fax Referral Inbound & OCR Extraction */
export function ReferralScene({ progress }: SceneProps) {
  const showSecondCard = progress > 0.35;
  const showThirdCard = progress > 0.65;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
        <span className="flex items-center gap-2 font-medium text-foreground">
          <ScanLine className="size-4 text-primary animate-pulse" /> Inbound Fax OCR Pipeline · Queue #1402
        </span>
        <AiBadge label="referral_extraction@1.3" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-2 text-xs text-muted-foreground">
            <span className="font-mono">FAX_2026-09-28_PAGE1.PDF</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">300 DPI</span>
          </div>

          <div className="relative mt-3 space-y-2 text-xs text-muted-foreground/80 font-mono select-none">
            <div className="absolute inset-x-0 h-0.5 bg-primary/80 blur-xs transition-all duration-75" style={{ top: `${Math.min(95, progress * 100)}%` }} />
            <p className="bg-primary/10 px-1 py-0.5 text-foreground rounded">PATIENT: DANIEL ORTIZ | DOB: 11/23/1966</p>
            <p>REF DR: J. MARTINEZ, MD | CLINIC: WEST VALLEY GI</p>
            <p className="bg-primary/10 px-1 py-0.5 text-foreground rounded">INSURANCE: MEDICARE PART B #9482-10492</p>
            <p>RX: WARFARIN 5MG DAILY (AFIB) - HOLD 5 DAYS PRE-OP</p>
            <p className="bg-primary/10 px-1 py-0.5 text-foreground rounded">PROCEDURE: SURVEILLANCE COLONOSCOPY</p>
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="rounded-xl border border-border bg-card p-3 shadow-xs">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Extracted Patient Profile</span>
            <div className="mt-2 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Name:</span>
                <span className="font-medium text-foreground">Daniel Ortiz (59M)</span>
                <ConfidenceBadge value={0.99} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Payer / Member:</span>
                <span className="font-medium text-foreground">Medicare #9482-10492</span>
                <ConfidenceBadge value={0.96} />
              </div>
            </div>
          </div>

          {showSecondCard && (
            <div className="rounded-xl border border-border bg-card p-3 shadow-xs transition-all duration-300">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">Medication Hold Alert</span>
                <span className="rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[10px] font-semibold">Hold Rule Applied</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Warfarin 5 mg: Discontinue 5 days prior; target INR ≤ 1.5.</p>
            </div>
          )}

          {showThirdCard && (
            <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              <span className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="size-3.5" /> 1-Click Patient Chart Created
              </span>
              <span className="font-mono text-[11px]">MRN-204361</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Scene 1: Pre-Op Assessment & Readiness Gate */
export function PreOpScene({ progress }: SceneProps) {
  const activeCount = Math.min(5, Math.floor(progress * 5) + 1);

  return (
    <div className="space-y-3">
      <PatientBanner
        patient={PATIENT}
        allergies={ALLERGIES}
        phase="READY_FOR_PROCEDURE"
        escort={{ name: "Lucia Ortiz", relationship: "Spouse", phone: "", confirmed: true, present: true }}
        meta={[<span key="case" className="font-mono">C-26-0103</span>, "Room 2 · 08:00", "Colonoscopy"]}
      />

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="space-y-2 rounded-xl border border-border bg-card p-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-semibold">Pre-Op RN Readiness Gate</span>
            <span className="rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[11px] font-semibold">
              {activeCount}/5 Checks Cleared
            </span>
          </div>

          <ul className="space-y-2 pt-1 text-xs">
            {(PREOP_GATE.checks ?? []).slice(0, activeCount).map((check) => (
              <li key={check.code} className="flex items-center gap-2 text-foreground">
                <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                <span className="font-medium">{check.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-card p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Escort & Vitals</span>
          <div className="space-y-1.5 pt-1 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>BP:</span>
              <span className="font-mono text-foreground">124 / 78 mmHg</span>
            </div>
            <div className="flex justify-between">
              <span>Heart Rate:</span>
              <span className="font-mono text-foreground">68 bpm</span>
            </div>
            <div className="flex justify-between">
              <span>NPO Status:</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">Strict NPO &gt; 8 hrs</span>
            </div>
            <div className="mt-2 rounded bg-muted/60 p-2 text-[11px] text-foreground">
              Escort: <span className="font-semibold">Lucia Ortiz</span> (Waiting in Bay 3)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Scene 2: Procedure Room Mode & Live Taps */
export function ProcedureScene({ progress }: SceneProps) {
  const withdrawalSeconds = 360 + Math.floor(progress * 180);
  const minutes = Math.floor(withdrawalSeconds / 60);
  const seconds = withdrawalSeconds % 60;
  const timeFormatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <div className="space-y-3">
      <PatientBanner
        patient={PATIENT}
        allergies={ALLERGIES}
        phase="IN_PROCEDURE"
        meta={[<span key="case" className="font-mono">C-26-0103</span>, "Room 2", "Dr. E. Vance, MD"]}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-3.5 text-center shadow-xs">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Withdrawal Clock</span>
          <div className="mt-1 font-mono text-2xl font-bold tracking-tight text-primary">{timeFormatted}</div>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">ADR Target Met (&gt; 6 min)</span>
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5 text-center shadow-xs">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Cecum Milestone</span>
          <div className="mt-1 font-mono text-xl font-bold tracking-tight text-foreground">08:19</div>
          <span className="text-[10px] text-muted-foreground">Appendiceal orifice photo saved</span>
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5 text-center shadow-xs">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">BBPS Quality Score</span>
          <div className="mt-1 font-mono text-xl font-bold tracking-tight text-foreground">3 + 3 + 3 = 9/9</div>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Excellent prep</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Activity className="size-4" />
          </span>
          <div>
            <div className="text-xs font-semibold text-foreground">Room Mode Tap Targets</div>
            <div className="text-[11px] text-muted-foreground">Jar A (Ascending 6 mm) · Jar B (Sigmoid 6 mm)</div>
          </div>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">2 Specimens Logged</span>
      </div>
    </div>
  );
}

/** Scene 3: AI Scribe Note Draft & Gap Resolution */
export function AiNoteScene({ progress }: SceneProps) {
  const isGapResolved = progress > 0.45;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card px-4 pt-3 pb-2">
        <PhaseStepper phase="IN_PROCEDURE" />
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="space-y-3 rounded-xl border border-border bg-card p-3.5 shadow-xs">
          <DraftBanner state="draft" meta="procedure_note@2.4 · 6.1 s" />

          {NOTE_SECTIONS.map((section) => (
            <div key={section.title} className="space-y-1">
              <div className="flex items-center gap-2">
                <FileText className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">{section.title}</span>
                <AiBadge label="AI" />
              </div>
              <p className="text-[13px] leading-relaxed text-muted-foreground">{section.body}</p>
            </div>
          ))}

          <GapChip chip={GAP_RESOLVED} />
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-card p-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-semibold">Physician Attestation</span>
            <Sparkles className="size-3.5 text-primary" />
          </div>

          <p className="text-xs text-muted-foreground">
            {isGapResolved
              ? "All clinical gaps resolved. Note is eligible for final digital signature."
              : "Critic checking note completeness against endoscopy documentation standards..."}
          </p>

          {/* Illustration only: kept out of the tab order so the player's real controls stay the focus path */}
          <span
            aria-hidden
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold shadow-xs transition-colors",
              isGapResolved ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground opacity-60",
            )}
          >
            <FileSignature className="size-3.5" /> Sign & Lock Note
          </span>
        </div>
      </div>
    </div>
  );
}

/** Scene 4: PACU Recovery & Discharge Gate */
export function PacuScene({ progress }: SceneProps) {
  const aldreteScore = progress > 0.4 ? 10 : 9;

  return (
    <div className="space-y-3">
      <PatientBanner
        patient={PATIENT}
        allergies={ALLERGIES}
        phase="RECOVERY"
        escort={{ name: "Lucia Ortiz", relationship: "Spouse", phone: "", confirmed: true, present: true }}
        meta={[<span key="case" className="font-mono">C-26-0103</span>, "PACU Bay 4", "Discharge Ready"]}
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-3 rounded-xl border border-border bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-semibold text-foreground">Discharge Instructions</span>
            <span className="rounded bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-semibold">Bilingual (EN / ES)</span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Colonic polyps removed (biopsy results in 3-5 business days). Avoid heavy lifting for 24 hours. Resume regular diet and
            medications as directed. Escort must accompany home.
          </p>
          <div className="flex items-center gap-2 pt-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <FileCheck2 className="size-4" /> Patient education signed & SMS copy delivered
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-card p-3.5 shadow-xs">
          <GateChecklist result={DISCHARGE_GATE} title={`Discharge gate (Aldrete: ${aldreteScore}/10)`} />
        </div>
      </div>
    </div>
  );
}

/** Scene 5: Autonomous Coding & 837P Export */
export function CodingScene({ progress }: SceneProps) {
  const showClaimReady = progress > 0.45;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
        <span className="flex items-center gap-2 font-medium text-foreground">
          <Receipt className="size-4 text-primary" /> Autonomous Coding & Charge Capture Engine
        </span>
        <AiBadge label="cpt_coder@2.1 · Evidence-Linked" />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-muted/50 text-muted-foreground">
            <tr>
              <th className="p-2.5 font-medium">Code</th>
              <th className="p-2.5 font-medium">Description</th>
              <th className="p-2.5 font-medium">Evidence Link</th>
              <th className="p-2.5 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr>
              <td className="p-2.5 font-mono font-bold text-foreground">45385</td>
              <td className="p-2.5 text-muted-foreground">Colonoscopy with lesion removal by snare</td>
              <td className="p-2.5 text-primary underline">findings@line_2</td>
              <td className="p-2.5 text-right font-medium text-emerald-600 dark:text-emerald-400">Attested</td>
            </tr>
            <tr>
              <td className="p-2.5 font-mono font-bold text-foreground">Z86.010</td>
              <td className="p-2.5 text-muted-foreground">Personal history of colonic polyps</td>
              <td className="p-2.5 text-primary underline">indication@line_1</td>
              <td className="p-2.5 text-right font-medium text-emerald-600 dark:text-emerald-400">Attested</td>
            </tr>
            <tr>
              <td className="p-2.5 font-mono font-bold text-foreground">Mod 33</td>
              <td className="p-2.5 text-muted-foreground">Preventive screening (Co-pay waived)</td>
              <td className="p-2.5 text-primary underline">payer_rule@preventive</td>
              <td className="p-2.5 text-right font-medium text-emerald-600 dark:text-emerald-400">Attested</td>
            </tr>
          </tbody>
        </table>
      </div>

      {showClaimReady && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-400 transition-all duration-300">
          <span className="flex items-center gap-2 font-medium">
            <Microscope className="size-4" /> 837P Professional Claim Export Ready · Recall set for 5-Year Surveillance
          </span>
          <span className="font-mono font-bold">$1,480.00</span>
        </div>
      )}
    </div>
  );
}
