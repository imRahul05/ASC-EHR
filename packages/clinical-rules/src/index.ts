// Pure clinical rules: the UI calls them for instant feedback, the API (and the dev mocks) re-check them.
// Every gate returns RuleResult { ok, reasons, checks? } from @asc/types.
export * from "./gates.js";
export * from "./meds.js";
export * from "./padss.js";
export * from "./phases.js";
export * from "./procedure-labels.js";
export * from "./readiness.js";
export * from "./result.js";
export * from "./schedule.js";
export * from "./scores.js";
export * from "./surveillance.js";
export * from "./time.js";
export * from "./patients/duplicate-match.js";
export * from "./scheduling/catalog.js";
export * from "./scheduling/conflicts.js";
export * from "./hp/validity.js";
export * from "./med-hold/anticoagulation.js";
export * from "./financial/index.js";
