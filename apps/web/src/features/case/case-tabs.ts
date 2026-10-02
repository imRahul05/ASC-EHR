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

function lazyTab(load: () => Promise<ComponentType<{ readonly caseId: string }>>) {
  return {
    Component: dynamic(load, { loading: fallback }),
    // Speculative (hover/focus): swallow failures; the render path via `dynamic` surfaces real load errors.
    preload: () => {
      load().catch(() => undefined);
    },
  };
}

const preProcedure = lazyTab(() => import("./tabs/pre-procedure-tab").then((m) => m.PreProcedureTab));
const preOp = lazyTab(() => import("./tabs/pre-op-tab").then((m) => m.PreOpTab));
const procedure = lazyTab(() => import("./tabs/procedure-tab").then((m) => m.ProcedureTab));
const anesthesia = lazyTab(() => import("./tabs/anesthesia-tab").then((m) => m.AnesthesiaTab));
const note = lazyTab(() => import("./tabs/note-tab").then((m) => m.NoteTab));
const recovery = lazyTab(() => import("./tabs/recovery-tab").then((m) => m.RecoveryTab));
const coding = lazyTab(() => import("./tabs/coding-tab").then((m) => m.CodingTab));
const pathology = lazyTab(() => import("./tabs/pathology-tab").then((m) => m.PathologyTab));

/**
 * Case workspace tabs, in workflow order. Each tab is `features/case/tabs/<id>-tab.tsx`
 * with props `{ caseId }`; the owning feature agent fills it in (spec §4).
 * Ids, defaults and `isCaseTab` live in `case-tab-ids.ts`: import those from there, not from here,
 * outside the case workspace (this module holds lazy loaders and preloads on demand, rather than eagerly pulling in tab implementations).
 */
export const CASE_TABS = [
  { id: "pre-procedure", label: "Pre-procedure", icon: Stethoscope, ...preProcedure },
  { id: "pre-op", label: "Pre-op", icon: ClipboardCheck, ...preOp },
  { id: "procedure", label: "Procedure", icon: Activity, ...procedure },
  { id: "anesthesia", label: "Anesthesia", icon: Syringe, ...anesthesia },
  { id: "note", label: "Note", icon: FileText, ...note },
  { id: "recovery", label: "Recovery", icon: HeartPulse, ...recovery },
  { id: "coding", label: "Coding", icon: Receipt, ...coding },
  { id: "pathology", label: "Pathology", icon: Microscope, ...pathology },
] as const satisfies readonly {
  id: (typeof CASE_TAB_IDS)[number];
  label: string;
  icon: LucideIcon;
  Component: ComponentType<{ readonly caseId: string }>;
  preload: () => void;
}[];
