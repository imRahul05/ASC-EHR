// @asc/fhir: FHIR types, our identifier systems and extension URLs, and pure typed builders.
// No I/O and no environment reads: every workspace, including the browser, can import it.
export type * from "@medplum/fhirtypes";
export * from "./urls.js";
export * from "./identifiers.js";
export * from "./case-phase.js";
export * from "./extensions.js";
export * from "./builders/common.js";
export * from "./builders/encounter.js";
export * from "./builders/patient.js";
