import { createElement, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { LoadingSkeleton } from "@asc/ui/components/clinical/loading-skeleton";
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

const fallback = () => createElement(LoadingSkeleton, { variant: "detail" });

const PreProcedureTab = dynamic(() => import("./tabs/pre-procedure-tab").then((mod) => mod.PreProcedureTab), {
  loading: fallback,
});
const PreOpTab = dynamic(() => import("./tabs/pre-op-tab").then((mod) => mod.PreOpTab), {
  loading: fallback,
});
const ProcedureTab = dynamic(() => import("./tabs/procedure-tab").then((mod) => mod.ProcedureTab), {
  loading: fallback,
});
const AnesthesiaTab = dynamic(() => import("./tabs/anesthesia-tab").then((mod) => mod.AnesthesiaTab), {
  loading: fallback,
});
const NoteTab = dynamic(() => import("./tabs/note-tab").then((mod) => mod.NoteTab), {
  loading: fallback,
});
const RecoveryTab = dynamic(() => import("./tabs/recovery-tab").then((mod) => mod.RecoveryTab), {
  loading: fallback,
});
const CodingTab = dynamic(() => import("./tabs/coding-tab").then((mod) => mod.CodingTab), {
  loading: fallback,
});
const PathologyTab = dynamic(() => import("./tabs/pathology-tab").then((mod) => mod.PathologyTab), {
  loading: fallback,
});

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
  Component: ComponentType<{ readonly caseId: string }>;
}[];
