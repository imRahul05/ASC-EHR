import type { Extension } from "@medplum/fhirtypes";
import { type CasePhase, casePhaseCode, casePhaseFromCode, isProcedureIntent, type ProcedureIntent } from "@asc/fhir/case-phase";
import { type CaseStage, caseStageCode, caseStageFromCode } from "@asc/fhir/case-stage";
import { type FhirUrls, fhirUrls } from "@asc/fhir/urls";

export { caseReadinessExtension, caseReadinessExtensions, readCaseReadiness } from "@asc/fhir/case-readiness";

/** The extension definitions (StructureDefinitions) we put on resources. Names are part of stored data. */
export function createExtensionUrls(urls: FhirUrls = fhirUrls) {
  return {
    /** On `Encounter`: the physical stage of the case per REQ-5 §164–180. */
    caseStage: urls.structureDefinition("case-stage"),
    /** On `Encounter`: computed clinical and administrative readiness checks per REQ-5 §185–199. */
    caseReadiness: urls.structureDefinition("case-readiness"),
    /** On `Encounter`: the phase of the case (deprecated alias/legacy). */
    casePhase: urls.structureDefinition("case-phase"),
    /** On `ServiceRequest`: screening, surveillance or diagnostic. */
    procedureIntent: urls.structureDefinition("procedure-intent"),
    /** On `Provenance`: the AI run that produced a draft. An opaque id, never content. */
    agentExecutionId: urls.structureDefinition("agent-execution-id"),
    /** On `Encounter`: financial clearance summary, estimates, and prior auth (P22a). */
    caseFinancial: urls.structureDefinition("case-financial"),
  } as const;
}

export const extensionUrls = createExtensionUrls();

export function caseStageExtension(stage: CaseStage, urls: FhirUrls = fhirUrls): Extension {
  return { url: createExtensionUrls(urls).caseStage, valueCoding: { system: urls.codeSystem("case-stage"), code: caseStageCode(stage) } };
}

export function casePhaseExtension(phase: CasePhase, urls: FhirUrls = fhirUrls): Extension {
  return { url: createExtensionUrls(urls).casePhase, valueCoding: { system: urls.codeSystem("case-phase"), code: casePhaseCode(phase) } };
}

export function procedureIntentExtension(intent: ProcedureIntent, urls: FhirUrls = fhirUrls): Extension {
  return { url: createExtensionUrls(urls).procedureIntent, valueCoding: { system: urls.codeSystem("procedure-intent"), code: intent } };
}

const OPAQUE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function agentExecutionIdExtension(agentExecutionId: string, urls: FhirUrls = fhirUrls): Extension {
  if (!OPAQUE_ID.test(agentExecutionId)) throw new Error("invalid agent execution id");
  return { url: createExtensionUrls(urls).agentExecutionId, valueString: agentExecutionId };
}

/** The first extension with this url, or undefined. */
const find = (extensions: readonly Extension[] | undefined, url: string) => extensions?.find((extension) => extension.url === url);

/** Reads back what `caseStageExtension` wrote; undefined for a missing extension or a code we did not write. */
export function readCaseStage(extensions: readonly Extension[] | undefined, urls: FhirUrls = fhirUrls): CaseStage | undefined {
  const coding = find(extensions, createExtensionUrls(urls).caseStage)?.valueCoding;
  return coding?.system === urls.codeSystem("case-stage") && coding.code !== undefined ? caseStageFromCode(coding.code) : undefined;
}

/** Reads back what `casePhaseExtension` wrote; undefined for a missing extension or a code we did not write. */
export function readCasePhase(extensions: readonly Extension[] | undefined, urls: FhirUrls = fhirUrls): CasePhase | undefined {
  const coding = find(extensions, createExtensionUrls(urls).casePhase)?.valueCoding;
  return coding?.system === urls.codeSystem("case-phase") && coding.code !== undefined ? casePhaseFromCode(coding.code) : undefined;
}

export function readProcedureIntent(extensions: readonly Extension[] | undefined, urls: FhirUrls = fhirUrls): ProcedureIntent | undefined {
  const coding = find(extensions, createExtensionUrls(urls).procedureIntent)?.valueCoding;
  return coding?.system === urls.codeSystem("procedure-intent") && coding.code !== undefined && isProcedureIntent(coding.code) ? coding.code : undefined;
}

export function readAgentExecutionId(extensions: readonly Extension[] | undefined, urls: FhirUrls = fhirUrls): string | undefined {
  return find(extensions, createExtensionUrls(urls).agentExecutionId)?.valueString;
}
