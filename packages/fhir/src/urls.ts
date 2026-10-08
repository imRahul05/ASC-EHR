/**
 * The canonical URL base of our FHIR profiles, extensions, code systems and identifier systems
 * (decided 2026-10-08, issue #54). Every such URL in the codebase is built from this module, so the
 * base is never typed as a string literal anywhere else (a test enforces it).
 *
 * These URLs are stored inside every resource. A different base in a different environment would
 * make data non-portable, so an override (tests, or a future rebrand with a data migration) must be
 * the same wherever data is shared. The override comes from `@asc/config` (`FHIR_CANONICAL_BASE`)
 * and is passed in by the app: this package reads no environment (LM-006).
 */
export const FHIR_CANONICAL_BASE = "https://fhir.wybit.io/asc/";

/** The pieces of a canonical URL: lower-case words joined by hyphens. */
const NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function assertCanonicalName(name: string): string {
  if (!NAME.test(name)) throw new Error(`invalid canonical name "${name}": use lower-case words joined by hyphens`);
  return name;
}

/** Throws unless `base` is an https URL that ends in "/" and has no query or fragment. */
export function assertCanonicalBase(base: string): string {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error("FHIR canonical base is not a URL");
  }
  if (url.protocol !== "https:" || !base.endsWith("/") || url.search !== "" || url.hash !== "") {
    throw new Error("FHIR canonical base must be an https URL ending in / with no query or fragment");
  }
  return base;
}

/**
 * Builds the canonical URLs from one base. Follows the FHIR convention that the canonical URL of a
 * resource is `<base><ResourceType>/<name>`, so an extension is a `StructureDefinition`.
 */
export function createFhirUrls(base: string = FHIR_CANONICAL_BASE) {
  const root = assertCanonicalBase(base);
  return {
    base: root,
    /** A profile or an extension definition. */
    structureDefinition: (name: string) => `${root}StructureDefinition/${assertCanonicalName(name)}`,
    codeSystem: (name: string) => `${root}CodeSystem/${assertCanonicalName(name)}`,
    valueSet: (name: string) => `${root}ValueSet/${assertCanonicalName(name)}`,
    /** The `system` of an identifier we issue (MRN, case number). */
    identifierSystem: (name: string) => `${root}identifier/${assertCanonicalName(name)}`,
  } as const;
}

export type FhirUrls = ReturnType<typeof createFhirUrls>;

/** The URLs for the default base. Apps with an override call `createFhirUrls(base)` instead. */
export const fhirUrls: FhirUrls = createFhirUrls();
