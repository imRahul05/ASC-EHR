import type { MedplumClient, PatchOperation, WithId } from "@medplum/core";
import type { Bundle, ExtractResource, Reference, Resource, ResourceType } from "@medplum/fhirtypes";

/**
 * Facility-scoped writes (P04 T5). Medplum's access policy limits a facility user by `meta.accounts` and checks
 * the criteria against the NEW version, while a plain read returns `meta` without the accounts, so a
 * read-modify-write that sends the body back as read is refused (spike results ADR, decision 1). Every
 * facility-scoped write therefore goes through `forFacility`, which stamps the facility on every create, update,
 * patch and transaction entry and refuses a body that names a different facility before the call. Apps never
 * call the raw write methods (lint rule in `@asc/eslint-config`).
 *
 * Errors name the resource type only, never a value: ids and contents can be PHI.
 */

/** Shared directory data: no facility account, readable by every staff role (spike S1). The one exempt list. */
export const DIRECTORY_RESOURCE_TYPES: readonly string[] = ["Practitioner", "PractitionerRole", "Organization", "Location"];

const FHIR_ID = /^[A-Za-z0-9.-]{1,64}$/;

/** The write methods a facility-scoped caller may use. Named differently from the raw client on purpose. */
export interface FacilityWriter {
  readonly facilityId: string;
  create<T extends Resource>(resource: T): Promise<WithId<T>>;
  update<T extends Resource>(resource: T): Promise<WithId<T>>;
  patch<RT extends ResourceType>(resourceType: RT, id: string, operations: PatchOperation[]): Promise<WithId<ExtractResource<RT>>>;
  transaction(bundle: Bundle): Promise<Bundle>;
}

type WriteClient = Pick<MedplumClient, "createResource" | "updateResource" | "patchResource" | "executeBatch">;

export function forFacility(client: WriteClient, facilityId: string): FacilityWriter {
  if (!FHIR_ID.test(facilityId)) throw new Error("invalid facility id");
  const account: Reference = { reference: `Organization/${facilityId}` };

  function stamp<T extends Resource>(resource: T): T {
    if (DIRECTORY_RESOURCE_TYPES.includes(resource.resourceType)) {
      throw new Error(`${resource.resourceType} is directory data, not facility-scoped`);
    }
    const meta = resource.meta;
    if (meta?.account !== undefined) throw new Error(`${resource.resourceType} uses the deprecated meta.account`);
    const named = meta?.accounts;
    if (named !== undefined && named.length > 0 && !(named.length === 1 && named[0]?.reference === account.reference)) {
      throw new Error(`${resource.resourceType} names another facility`);
    }
    return { ...resource, meta: { ...meta, accounts: [account] } };
  }

  return {
    facilityId,
    create: (resource) => client.createResource(stamp(resource)),
    update: (resource) => client.updateResource(stamp(resource)),
    patch: (resourceType, id, operations) => {
      if (DIRECTORY_RESOURCE_TYPES.includes(resourceType)) throw new Error(`${resourceType} is directory data, not facility-scoped`);
      if (operations.some((operation) => operation.path === "/meta" || operation.path.startsWith("/meta/"))) {
        throw new Error(`${resourceType} patch may not change meta`);
      }
      return client.patchResource(resourceType, id, [...operations, { op: "add", path: "/meta/accounts", value: [account] }]);
    },
    transaction: (bundle) => {
      if (bundle.type !== "transaction") throw new Error("only a transaction bundle is accepted");
      const entry = (bundle.entry ?? []).map((item) => {
        const method = item.request?.method;
        if (method === "POST" || method === "PUT") {
          if (item.resource === undefined) throw new Error("a transaction write needs a resource");
          return { ...item, resource: stamp(item.resource) };
        }
        if (method === "GET" || method === "DELETE") return item;
        throw new Error("transaction entries may only POST, PUT, GET or DELETE");
      });
      return client.executeBatch({ ...bundle, entry });
    },
  };
}
