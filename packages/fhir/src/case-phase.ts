import type { CasePhase, ProcedureIntent } from "@asc/types";
import type { CodeSystem } from "@medplum/fhirtypes";
import { type FhirUrls, fhirUrls } from "@asc/fhir/urls";

/**
 * The FHIR side of the case phase. The `CasePhase` type itself is defined once, in `@asc/types`; this module
 * maps it to the codes stored on the Encounter and describes them as a CodeSystem. Both tables are typed as
 * `Record<CasePhase, ...>`, so adding a phase in `@asc/types` without a code here fails the type check.
 * Order and transitions live in `@asc/clinical-rules`, not here.
 */
export type { CasePhase, ProcedureIntent } from "@asc/types";

/** Stored code and display of each phase (state machine: docs/product/04 §4.2). */
const CASE_PHASES: Readonly<Record<CasePhase, { readonly code: string; readonly display: string }>> = {
  SCHEDULED: { code: "scheduled", display: "Scheduled" },
  CONFIRMED: { code: "confirmed", display: "Confirmed" },
  ARRIVED: { code: "arrived", display: "Arrived" },
  PRE_OP: { code: "pre-op", display: "Pre-op" },
  READY_FOR_PROCEDURE: { code: "ready-for-procedure", display: "Ready for procedure" },
  IN_PROCEDURE: { code: "in-procedure", display: "In procedure" },
  RECOVERY: { code: "recovery", display: "Recovery" },
  READY_FOR_DISCHARGE: { code: "ready-for-discharge", display: "Ready for discharge" },
  DISCHARGED: { code: "discharged", display: "Discharged" },
  CHART_COMPLETE: { code: "chart-complete", display: "Chart complete" },
  CODED: { code: "coded", display: "Coded" },
  EXPORTED: { code: "exported", display: "Exported" },
  CLOSED: { code: "closed", display: "Closed" },
  CANCELLED: { code: "cancelled", display: "Cancelled" },
  NO_SHOW: { code: "no-show", display: "No show" },
};

/** Why the procedure is done; set at booking, read by coding (docs/product/03 §3). */
const PROCEDURE_INTENTS: Readonly<Record<ProcedureIntent, string>> = {
  screening: "Screening",
  surveillance: "Surveillance",
  diagnostic: "Diagnostic",
};

const PHASE_BY_CODE: ReadonlyMap<string, CasePhase> = new Map(
  (Object.entries(CASE_PHASES) as [CasePhase, { code: string }][]).map(([phase, { code }]) => [code, phase]),
);

export const casePhaseCode = (phase: CasePhase): string => CASE_PHASES[phase].code;

/** The phase for a stored code, or undefined for anything we did not write. */
export const casePhaseFromCode = (code: string): CasePhase | undefined => PHASE_BY_CODE.get(code);

export const isProcedureIntent = (value: string): value is ProcedureIntent => Object.hasOwn(PROCEDURE_INTENTS, value);

/** The CodeSystem to upload to Medplum (P08 loads it). Concepts follow the happy path, then the stopped phases. */
export function buildCasePhaseCodeSystem(urls: FhirUrls = fhirUrls): CodeSystem {
  return {
    resourceType: "CodeSystem",
    url: urls.codeSystem("case-phase"),
    name: "CasePhase",
    title: "Case phase",
    status: "active",
    content: "complete",
    caseSensitive: true,
    description: "Phase of a surgical case (the Encounter), from scheduling to closed, plus the stopped phases.",
    concept: (Object.values(CASE_PHASES)).map(({ code, display }) => ({ code, display })),
  };
}

export function buildProcedureIntentCodeSystem(urls: FhirUrls = fhirUrls): CodeSystem {
  return {
    resourceType: "CodeSystem",
    url: urls.codeSystem("procedure-intent"),
    name: "ProcedureIntent",
    title: "Procedure intent",
    status: "active",
    content: "complete",
    caseSensitive: true,
    description: "Why a procedure is done: screening, surveillance or diagnostic.",
    concept: Object.entries(PROCEDURE_INTENTS).map(([code, display]) => ({ code, display })),
  };
}
