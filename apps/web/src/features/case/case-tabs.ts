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
import type { CASE_TAB_IDS } from "./case-tab-ids";
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
 * Ids, defaults and `isCaseTab` live in `case-tab-ids.ts`: import those from there, not from here,
 * outside the case workspace (this module pulls in every tab component).
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
  id: (typeof CASE_TAB_IDS)[number];
  label: string;
  icon: LucideIcon;
  Component: (props: { readonly caseId: string }) => React.ReactNode;
}[];
