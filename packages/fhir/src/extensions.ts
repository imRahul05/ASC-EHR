import type { Extension } from "@medplum/fhirtypes";
import { type CasePhase, casePhaseCode, casePhaseFromCode, isProcedureIntent, type ProcedureIntent } from "@asc/fhir/case-phase";
import { type FhirUrls, fhirUrls } from "@asc/fhir/urls";

/** The extension definitions (StructureDefinitions) we put on resources. Names are part of stored data. */
export function createExtensionUrls(urls: FhirUrls = fhirUrls) {
  return {
    /** On `Encounter`: the phase of the case. */
    casePhase: urls.structureDefinition("case-phase"),
    /** On `ServiceRequest`: screening, surveillance or diagnostic. */
    procedureIntent: urls.structureDefinition("procedure-intent"),
    /** On `Provenance`: the AI run that produced a draft. An opaque id, never content. */
    agentExecutionId: urls.structureDefinition("agent-execution-id"),
  } as const;
}

export const extensionUrls = createExtensionUrls();

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
