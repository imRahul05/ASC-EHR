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

function lazyTab(importer: () => Promise<{ [key: string]: ComponentType<{ readonly caseId: string }> }>, exportName: string) {
  return dynamic(() => importer().then((mod) => mod[exportName] as ComponentType<{ readonly caseId: string }>), {
    loading: fallback,
  });
}

const PreProcedureTab = lazyTab(() => import("./tabs/pre-procedure-tab"), "PreProcedureTab");
const PreOpTab = lazyTab(() => import("./tabs/pre-op-tab"), "PreOpTab");
const ProcedureTab = lazyTab(() => import("./tabs/procedure-tab"), "ProcedureTab");
const AnesthesiaTab = lazyTab(() => import("./tabs/anesthesia-tab"), "AnesthesiaTab");
const NoteTab = lazyTab(() => import("./tabs/note-tab"), "NoteTab");
const RecoveryTab = lazyTab(() => import("./tabs/recovery-tab"), "RecoveryTab");
const CodingTab = lazyTab(() => import("./tabs/coding-tab"), "CodingTab");
const PathologyTab = lazyTab(() => import("./tabs/pathology-tab"), "PathologyTab");

export const PRELOAD_TAB: Record<string, () => void> = {
  "pre-procedure": () => { void import("./tabs/pre-procedure-tab"); },
  "pre-op": () => { void import("./tabs/pre-op-tab"); },
  "procedure": () => { void import("./tabs/procedure-tab"); },
  "anesthesia": () => { void import("./tabs/anesthesia-tab"); },
  "note": () => { void import("./tabs/note-tab"); },
  "recovery": () => { void import("./tabs/recovery-tab"); },
  "coding": () => { void import("./tabs/coding-tab"); },
  "pathology": () => { void import("./tabs/pathology-tab"); },
};

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
