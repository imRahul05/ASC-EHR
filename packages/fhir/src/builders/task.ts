import type { Task } from "@medplum/fhirtypes";
import { facilityMeta, instant, reference, text } from "@asc/fhir/builders/common";
import { assertCanonicalName, type FhirUrls, fhirUrls } from "@asc/fhir/urls";

export interface WorklistTaskInput {
  readonly facilityId: string;
  /**
   * The kind of work item (sign, specimen, prep, coder ...), a lower-case name such as `sign-note`. The list and its
   * CodeSystem belong to the worklist phase (P12); this builder only checks the shape.
   */
  readonly type: string;
  readonly patientId?: string;
  /** The case (Encounter) the work is about. */
  readonly encounterId?: string;
  /** The Practitioner it is assigned to, if already assigned. */
  readonly ownerId?: string;
  readonly description?: string;
  readonly authoredOn?: string;
  readonly dueBy?: string;
}

/** A worklist item, open and unassigned unless an owner is given. */
export function buildTask(input: WorklistTaskInput, urls: FhirUrls = fhirUrls): Task {
  return {
    resourceType: "Task",
    meta: facilityMeta(input.facilityId),
    status: input.ownerId === undefined ? "requested" : "accepted",
    intent: "order",
    code: { coding: [{ system: urls.codeSystem("task-type"), code: assertCanonicalName(input.type) }] },
    ...(input.patientId === undefined ? {} : { for: reference("Patient", input.patientId, "patient id") }),
    ...(input.encounterId === undefined ? {} : { focus: reference("Encounter", input.encounterId, "encounter id") }),
    ...(input.ownerId === undefined ? {} : { owner: reference("Practitioner", input.ownerId, "owner id") }),
    ...(input.description === undefined ? {} : { description: text(input.description, "task description") }),
    ...(input.authoredOn === undefined ? {} : { authoredOn: instant(input.authoredOn, "task authored time") }),
    ...(input.dueBy === undefined ? {} : { restriction: { period: { end: instant(input.dueBy, "task due time") } } }),
  };
}
