import type { Bundle, BundleEntry, Reference, Resource } from "@medplum/fhirtypes";
import { facilityMeta } from "@asc/fhir/builders/common";

/**
 * Tenant-wide directory data carries no facility tag (P05b follow-up, ADR 2026-10-08): the access policy does not
 * filter it, so it is the only thing a transaction may contain without `meta.account`.
 */
const SHARED_DIRECTORY: ReadonlySet<string> = new Set(["Practitioner", "PractitionerRole", "Organization", "Location"]);

export interface TransactionOptions {
  /** The facility every entry must belong to. */
  readonly facilityId: string;
  /** Source of ids for `urn:uuid` full URLs; the default uses the platform's `crypto.randomUUID()`. */
  readonly newId?: () => string;
}

export interface Transaction {
  /**
   * Adds a resource to create. Returns a reference to it (`urn:uuid:...`) for other entries to use; Medplum swaps
   * it for the real id. `ifNoneExist` makes the create conditional (a search such as `identifier=system|value`).
   */
  add<R extends Resource>(key: string, resource: R, options?: { readonly ifNoneExist?: string }): Reference<R>;
  /** A reference to the entry added (or yet to be added) under `key`, so entries may refer forward. */
  ref<R extends Resource = Resource>(key: string): Reference<R>;
  build(): Bundle;
}

/** A FHIR transaction: all entries are written, or none. Facility rule checked per entry (P05h decision 3). */
export function createTransaction({ facilityId, newId = () => globalThis.crypto.randomUUID() }: TransactionOptions): Transaction {
  const account = facilityMeta(facilityId).account?.reference; // also checks the id
  const urls = new Map<string, string>();
  const entries = new Map<string, BundleEntry>();

  const fullUrl = (key: string): string => {
    if (key.length === 0 || key.length > 64) throw new Error("invalid transaction key");
    let url = urls.get(key);
    if (url === undefined) {
      url = `urn:uuid:${newId()}`;
      urls.set(key, url);
    }
    return url;
  };

  return {
    ref: <R extends Resource>(key: string): Reference<R> => ({ reference: fullUrl(key) }),
    add<R extends Resource>(key: string, resource: R, options: { readonly ifNoneExist?: string } = {}): Reference<R> {
      if (entries.has(key)) throw new Error("duplicate transaction key");
      if (!SHARED_DIRECTORY.has(resource.resourceType) && (resource as { meta?: { account?: Reference } }).meta?.account?.reference !== account) {
        throw new Error(`${resource.resourceType} is not tagged with the transaction's facility`);
      }
      const url = fullUrl(key);
      entries.set(key, {
        fullUrl: url,
        resource,
        request: { method: "POST", url: resource.resourceType, ...(options.ifNoneExist === undefined ? {} : { ifNoneExist: options.ifNoneExist }) },
      });
      return { reference: url };
    },
    build() {
      const dangling = [...urls.keys()].filter((key) => !entries.has(key));
      if (dangling.length > 0) throw new Error(`transaction refers to ${dangling.length} entry(ies) that were never added`);
      return { resourceType: "Bundle", type: "transaction", entry: [...entries.values()] };
    },
  };
}
