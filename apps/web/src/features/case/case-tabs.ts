import type { CasePhase } from "@asc/types";
import {
  Activity,
  ClipboardCheck,
  FileText,
  HeartPulse,
  Microscope,
  Receipt,
  Stethoscope,
  Syringe,
  type LucideIcon,
} from "@asc/ui/icons";
import { AnesthesiaTab } from "./tabs/anesthesia-tab";
import { CodingTab } from "./tabs/coding-tab";
import { NoteTab } from "./tabs/note-tab";
import { PathologyTab } from "./tabs/pathology-tab";
import { PreOpTab } from "./tabs/pre-op-tab";
import { PreProcedureTab } from "./tabs/pre-procedure-tab";
import { ProcedureTab } from "./tabs/procedure-tab";
import { RecoveryTab } from "./tabs/recovery-tab";

/**
 * Case workspace tabs, in workflow order. Each tab is `features/case/tabs/<id>-tab.tsx`
 * with props `{ caseId }`; the owning feature agent fills it in (spec §4).
 */
export const CASE_TABS = [
  { id: "pre-procedure", label: "Pre-procedure", icon: Stethoscope, Component: PreProcedureTab },
  { id: "pre-op", label: "Pre-op", icon: ClipboardCheck, Component: PreOpTab },
  { id: "procedure", label: "Procedure", icon: Activity, Component: ProcedureTab },
  { id: "anesthesia", label: "Anesthesia", icon: Syringe, Component: AnesthesiaTab },
  { id: "note", label: "Note", icon: FileText, Component: NoteTab },
  { id: "recovery", label: "Recovery", icon: HeartPulse, Component: RecoveryTab },
  { id: "coding", label: "Coding", icon: Receipt, Component: CodingTab },
  { id: "pathology", label: "Pathology", icon: Microscope, Component: PathologyTab },
] as const satisfies readonly {
  id: string;
  label: string;
  icon: LucideIcon;
  Component: (props: { readonly caseId: string }) => React.ReactNode;
}[];

type CaseTabId = (typeof CASE_TABS)[number]["id"];

/** Tab opened when the URL has no `?tab=` — follows where the case is in the workflow. */
export const DEFAULT_TAB_BY_PHASE: Readonly<Record<CasePhase, CaseTabId>> = {
  SCHEDULED: "pre-procedure",
  CONFIRMED: "pre-procedure",
  ARRIVED: "pre-op",
  PRE_OP: "pre-op",
  READY_FOR_PROCEDURE: "procedure",
  IN_PROCEDURE: "procedure",
  RECOVERY: "recovery",
  READY_FOR_DISCHARGE: "recovery",
  DISCHARGED: "note",
  CHART_COMPLETE: "coding",
  CODED: "coding",
  EXPORTED: "pathology",
  CLOSED: "pathology",
  CANCELLED: "pre-procedure",
  NO_SHOW: "pre-procedure",
};

export function isCaseTab(value: string | null): value is CaseTabId {
  return CASE_TABS.some((tab) => tab.id === value);
}
