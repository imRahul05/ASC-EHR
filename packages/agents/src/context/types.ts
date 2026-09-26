/**
 * Context: whatever is assembled and sent to the model for ONE run. It is
 * ephemeral — values are never persisted by this package; only a manifest of
 * their metadata is (on the run record, referenced from the audit event).
 *
 * Every item carries provenance (source), authority, temporal validity, the
 * scope it belongs to, sensitivity and trust, so a run can reject cross-patient
 * or stale data and derive `containsPhi` instead of trusting the caller.
 *
 * Interfaces only: `ContextProvider` implementations (Medplum reads, org
 * config, knowledge packs) live in the apps, like the audit store.
 *
 * Review: docs/agent/memory-skills-proposal-review.md §1 (vocabulary), §6 (metadata).
 */

/** Who / what a run is about. Every context item must belong to it (cross-patient guard). */
export interface RunScope {
  /** Facility `Organization` (Medplum compartment). */
  orgId: string;
  /** Internal ids only — never names or MRNs. */
  patientId?: string;
  caseId?: string;
}

/** Where an item came from — enough to reproduce it (FHIR `Provenance.entity`), never its content. */
export interface ContextSource {
  system: 'fhir' | 'knowledge' | 'config' | 'input';
  /** FHIR resource type, knowledge pack or config section, e.g. `Observation`. */
  resourceType?: string;
  /** Resource / pack id. */
  id?: string;
  /** FHIR `meta.versionId`, knowledge pack version, config revision. */
  version?: string;
}

/**
 * How authoritative an item is. Outputs must never upgrade a lower-authority
 * fact (authority monotonicity): the record wins over a patient-reported value.
 */
export type ContextAuthority =
  | 'record'
  | 'clinician'
  | 'patient-reported'
  | 'device'
  | 'org-config'
  | 'knowledge'
  | 'model-derived';

/** `phi` items force PHI routing (BAA-only endpoints). */
export type ContextSensitivity = 'phi' | 'none';

/**
 * `operator`: written by us or a clinician (config, structured record fields).
 * `untrusted-text`: free text from documents, faxes, patients — may carry
 * instructions; render it only through `wrapUntrustedText`.
 */
export type ContextTrust = 'operator' | 'untrusted-text';

/** Item metadata — everything except the value. Safe to persist and hash; contains ids but no clinical content. */
export interface ContextItemMeta {
  /**
   * Static, code-defined name of the fact, e.g. `labs.inr`. Keys appear in
   * errors and manifests, so they must never be built from data.
   */
  key: string;
  source: ContextSource;
  authority: ContextAuthority;
  /** When the fact was true clinically (ISO 8601), e.g. when the lab was drawn. */
  effectiveAt?: string;
  /** When the provider read it (ISO 8601). */
  retrievedAt: string;
  /** Max age, measured from `effectiveAt` (else `retrievedAt`). */
  maxAgeMs?: number;
  /** Absolute expiry (ISO 8601). */
  validUntil?: string;
  scope: RunScope;
  sensitivity: ContextSensitivity;
  trust: ContextTrust;
  /** `computeContentHash(value)` — detects change between runs without storing the value. */
  contentHash: string;
}

/** One resolved context fact: metadata plus the value (which may be PHI). */
export interface ContextItem<T = unknown> extends ContextItemMeta {
  value: T;
}

/** Persisted instead of the context: metadata only, never values. */
export type ContextManifestEntry = ContextItemMeta;

/** The context of one run, passed to `runAgent` (and on to `buildMessages`). */
export interface RunContext {
  scope: RunScope;
  items: readonly ContextItem[];
}

/**
 * Loads one context item for a run. Implemented in apps (e.g. a Medplum read
 * on behalf of the triggering user); the package only defines the contract.
 * Providers set `scope` from what they actually read, so `assertContextScope`
 * can catch a provider that returned another patient's data.
 */
export interface ContextProvider<T = unknown> {
  readonly name: string;
  load(scope: RunScope, signal?: AbortSignal): Promise<ContextItem<T>>;
}
