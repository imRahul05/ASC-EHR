import type { Provenance, Resource } from "@medplum/fhirtypes";
import { facilityMeta, instant, reference } from "@asc/fhir/builders/common";
import { agentExecutionIdExtension } from "@asc/fhir/extensions";
import { type FhirUrls, fhirUrls } from "@asc/fhir/urls";

/** How the agent took part: HL7 provenance-participant-type codes. A signature is `attester`. */
export type ProvenanceRole = "author" | "verifier" | "attester";

export interface ProvenanceInput {
  readonly facilityId: string;
  /** What this provenance is about, for example `Composition` and the note's id. */
  readonly target: { readonly type: Resource["resourceType"]; readonly id: string };
  /** The person (Practitioner) who acted. */
  readonly practitionerId: string;
  readonly role: ProvenanceRole;
  readonly recorded: string;
  /** The AI run that produced a draft, an opaque id (docs/product/03 §3). Never the content. */
  readonly agentExecutionId?: string;
}

/** Who did what to a resource, and which AI run drafted it. Written together with the resource it describes. */
export function buildProvenance(input: ProvenanceInput, urls: FhirUrls = fhirUrls): Provenance {
  return {
    resourceType: "Provenance",
    meta: facilityMeta(input.facilityId),
    target: [reference(input.target.type, input.target.id, "provenance target id")],
    recorded: instant(input.recorded, "provenance time"),
    agent: [
      {
        type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/provenance-participant-type", code: input.role }] },
        who: reference("Practitioner", input.practitionerId, "practitioner id"),
      },
    ],
    ...(input.agentExecutionId === undefined ? {} : { extension: [agentExecutionIdExtension(input.agentExecutionId, urls)] }),
  };
}
