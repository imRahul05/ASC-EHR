/**
 * PHI / secret redaction rules for @asc/logger.
 *
 * SENSITIVE_KEYS is the single source of truth for "keys whose values must never
 * leave the process in clear". It is shared with @asc/audit, which rejects these
 * keys in audit `details`.
 *
 * Internal resource IDs (patientId, surgicalCaseId, encounterId, ...) are
 * intentionally NOT listed: docs/COMPLIANCE_AND_PHI.md allows IDs as metadata.
 */
export const SENSITIVE_KEYS = [
  // Credentials / secrets
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "password",
  "token",
  "secret",
  "accessToken",
  "refreshToken",
  "apiKey",
  // Direct patient identifiers / demographics
  "ssn",
  "dob",
  "birthDate",
  "address",
  "telecom",
  "phone",
  "email",
  "mrn",
  "identifier",
  "given",
  "family",
  "firstName",
  "lastName",
  // LLM payloads (may carry PHI from the context window)
  "prompt",
  "modelOutput",
  "messages",
  "transcript",
  // FHIR clinical content
  "text", // FHIR narrative (Resource.text)
  "contained",
  "note",
  "valueString",
] as const;

export type SensitiveKey = (typeof SENSITIVE_KEYS)[number];

/** Max number of `*` wildcard levels generated in front of each key. */
export const REDACT_WILDCARD_DEPTH = 4;

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Renders one path segment in fast-redact syntax (`.key` or `["x-api-key"]`). */
function segment(key: string): string {
  return IDENTIFIER_RE.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
}

/**
 * Builds pino `redact.paths` covering every key at the top level and nested
 * under 1..depth wildcard levels, e.g. `dob`, `*.dob`, `*.*.dob`, ...
 * Hyphenated keys use bracket syntax: `["x-api-key"]`, `*["x-api-key"]`.
 * Arrays are covered too (`*` matches array indices).
 */
export function buildRedactPaths(
  keys: readonly string[] = SENSITIVE_KEYS,
  depth: number = REDACT_WILDCARD_DEPTH,
): string[] {
  const paths = new Set<string>();
  for (const key of keys) {
    const seg = segment(key);
    // Top level: identifiers are bare (`dob`), others bracketed (`["x-api-key"]`).
    paths.add(seg.startsWith(".") ? key : seg);
    let prefix = "*";
    for (let level = 1; level <= depth; level++) {
      paths.add(`${prefix}${seg}`);
      prefix += ".*";
    }
  }
  // Explicit, readable entries for the most common header locations
  // (already covered by the wildcards above; kept for intent/documentation).
  for (const header of ["authorization", "cookie", "x-api-key"]) {
    paths.add(`req.headers${segment(header)}`);
  }
  return [...paths];
}

/** Normalises a key for case/punctuation-insensitive comparison (`X_Api-Key` -> `xapikey`). */
export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const NORMALIZED_SENSITIVE = new Set(SENSITIVE_KEYS.map(normalizeKey));

/** True if `key` matches a sensitive key, ignoring case and `-`/`_` punctuation. */
export function isSensitiveKey(key: string): boolean {
  return NORMALIZED_SENSITIVE.has(normalizeKey(key));
}

export const REDACT_CENSOR = "[REDACTED]";
