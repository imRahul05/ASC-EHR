import type { Meta, Reference, Resource } from "@medplum/fhirtypes";

/**
 * Shared by every builder. Errors name the field and never echo the value: ids, names and dates can be PHI.
 */

const FHIR_ID = /^[A-Za-z0-9.-]{1,64}$/;

/** A FHIR logical id (what Medplum issues), checked before it goes into a reference. */
export function fhirId(value: string, field: string): string {
  if (!FHIR_ID.test(value)) throw new Error(`invalid ${field}`);
  return value;
}

/** A literal reference `Type/id`, typed to the resource it points at where the FHIR type asks for one. */
export function reference<R extends Resource = Resource>(type: R["resourceType"], id: string, field: string = `${type} id`): Reference<R> {
  return { reference: `${type}/${fhirId(id, field)}` };
}

/**
 * The facility a resource belongs to. Medplum's access policy limits a facility user by `meta.accounts`, and a
 * write without it is refused (P05h decision 3, ADR 2026-10-08), so every facility-scoped builder sets it. The
 * singular `meta.account` is deprecated in Medplum 5 and never written (LM-022). A builder names one facility; a
 * Patient seen at several facilities gets the others through Medplum's `$set-accounts`, a policy still to decide.
 */
export function facilityMeta(facilityId: string): Meta {
  return { accounts: [reference("Organization", facilityId, "facility id")] };
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` that is a real calendar date. */
export function isoDate(value: string, field: string): string {
  const time = Date.parse(`${value}T00:00:00Z`);
  // toISOString() throws on an invalid date, so a bad month must be rejected before it is called.
  if (!DATE.test(value) || Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new Error(`invalid ${field}`);
  return value;
}

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** A FHIR instant: date, time and an explicit time zone. */
export function instant(value: string, field: string): string {
  if (!INSTANT.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`invalid ${field}`);
  return value;
}

/** A non-blank, bounded text with no control characters (names and descriptions). */
export function text(value: string, field: string, max = 200): string {
  if (value.trim().length === 0 || value.length > max || /\p{Cc}/u.test(value)) throw new Error(`invalid ${field}`);
  return value;
}
