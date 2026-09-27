// Pure clinical rules: the UI calls them for instant feedback, the API (and the dev mocks) re-check them.
// Every gate returns RuleResult { ok, reasons, checks? } from @asc/types.
export * from "./gates";
export * from "./meds";
export * from "./phases";
export * from "./result";
export * from "./schedule";
export * from "./scores";
export * from "./surveillance";
export * from "./time";
