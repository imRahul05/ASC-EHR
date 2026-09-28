// Primitives (shadcn on Base UI)
export * from "./components/ui/avatar";
export * from "./components/ui/badge";
export * from "./components/ui/button";
export * from "./components/ui/card";
export * from "./components/ui/checkbox";
export * from "./components/ui/dialog";
export * from "./components/ui/dropdown-menu";
export * from "./components/ui/input";
export * from "./components/ui/kbd";
export * from "./components/ui/label";
export * from "./components/ui/progress";
export * from "./components/ui/select";
export * from "./components/ui/separator";
export * from "./components/ui/sheet";
export * from "./components/ui/sidebar";
export * from "./components/ui/skeleton";
export * from "./components/ui/sonner";
export * from "./components/ui/switch";
export * from "./components/ui/table";
export * from "./components/ui/tabs";
export * from "./components/ui/textarea";
export * from "./components/ui/tooltip";
export * from "./lib/utils";

// Forms, theme, navigation
export * from "./components/form/form-field";
export * from "./components/navigation/command-palette";
export * from "./components/theme/theme-provider";
export * from "./components/theme/theme-toggle";

// Clinical kit (presentational: props in, callbacks out) — see CATALOG.md
export * from "./components/clinical/ai-badge";
export * from "./components/clinical/data-table";
export * from "./components/clinical/draft-banner";
export * from "./components/clinical/empty-state";
export * from "./components/clinical/error-state";
export * from "./components/clinical/gap-chip";
export * from "./components/clinical/gate-checklist";
export * from "./components/clinical/loading-skeleton";
export * from "./components/clinical/page-header";
export * from "./components/clinical/patient-banner";
export * from "./components/clinical/phase-chip";
export * from "./components/clinical/phase-stepper";
export * from "./components/clinical/phase-style";
export * from "./components/clinical/provenance-chip";
export * from "./components/clinical/section-card";
export * from "./components/clinical/stat-card";
export * from "./components/clinical/timeline";
export * from "./components/clinical/signature-pad";
export * from "./components/clinical/sparkline";
export * from "./hooks/use-now";
export * from "./components/form/segmented-control";
export * from "./components/charts/trend-chart";
export * from "./components/charts/target-bar-list";
// Owner A (front desk): selects, fax source preview, AI confidence, schedule grid, async status
export * from "./components/form/option-select";
export * from "./components/clinical/source-document";
export * from "./components/clinical/confidence-badge";
export * from "./components/clinical/room-time-grid";
export * from "./components/clinical/stale-badge";
export * from "./components/clinical/offline-banner";
export * from "./components/clinical/eligibility-chip";
export * from "./hooks/use-online-status";
// Owner C (procedure room & AI note): timers, pipeline progress, room tap targets, offline queue pill
export * from "./components/clinical/elapsed-time";
export * from "./components/clinical/pipeline-steps";
export * from "./components/clinical/tap-tile";
export * from "./components/clinical/offline-queue-badge";
// Onboarding & help (welcome, guided tour, page help, hint strips)
export * from "./components/guide/welcome-dialog";
export * from "./components/guide/tour-checklist";
export * from "./components/guide/help-sheet";
export * from "./components/guide/hint-strip";
