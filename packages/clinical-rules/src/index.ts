// Pure clinical rules: the UI calls them for instant feedback, the API (and the dev mocks) re-check them.
// Every gate returns RuleResult { ok, reasons, checks? } from @asc/types.
export * from "./gates";
export * from "./meds";
export * from "./padss";
export * from "./phases";
export * from "./procedure-labels";
export * from "./readiness";
export * from "./result";
export * from "./schedule";
export * from "./scores";
export * from "./surveillance";
export * from "./time";
export * from "./patients/duplicate-match";
export * from "./scheduling/catalog";
export * from "./scheduling/conflicts";
export * from "./hp/validity";
export * from "./med-hold/anticoagulation";
export * from "./financial/index";
