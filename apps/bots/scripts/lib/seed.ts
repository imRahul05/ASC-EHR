/**
 * Idempotent seeding of a LOCAL Medplum with synthetic data. Every create is
 * conditional (by identifier or name), so running the seed again changes nothing.
 * Synthetic only: no real names, dates of birth or identifiers.
 */

import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { MedplumClient } from "@medplum/core";

export const SEED_SYSTEM = "urn:asc-ehr:seed";
export const PROJECT_NAME = "ASC EHR (local)";
export const FACILITY_KEY = "facility-demo-1";
/** A second facility, so tests can prove that a user at the first cannot reach the second. */
export const SECOND_FACILITY_KEY = "facility-demo-2";

/** The narrow slice of the Medplum client the seed uses (so tests can fake it). */
type Medplum = Pick<
  MedplumClient,
  "createResourceIfNoneExist" | "createResource" | "updateResource" | "searchResources" | "deleteResource"
>;
type ProjectAdmin = Pick<MedplumClient, "searchResources" | "post" | "fhirUrl">;

type ClientAppDefinition = {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly redirectUri?: string;
  readonly secret: boolean;
  readonly membership: boolean;
  /** Name of the service policy (`infra/medplum/service-policies.json`) the membership holds. Required with a membership. */
  readonly policy?: string;
  /**
   * One client per facility (`<name>@<facility key>`), each membership binding the policy's `%facility` to that
   * facility, so Medplum confines it there (#60). Needs a secret, a membership and a policy.
   */
  readonly perFacility?: boolean;
};

/** A seeded facility, as the per-facility clients need it. */
interface SeededFacility {
  readonly key: string;
  readonly id: string;
}

export const SYNTHETIC_TAG = [{ system: SEED_SYSTEM, code: "synthetic", display: "Synthetic seed data" }];
export const identifierOf = (value: string) => [{ system: SEED_SYSTEM, value }];
export const conditionOf = (value: string) => `identifier=${SEED_SYSTEM}|${value}`;

/** A string property of a response body whose shape Medplum does not type (`post` returns any). */
export function stringField(body: unknown, field: string): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const value = (body as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

/** The seeded project, created on first run (as the super admin who owns it). */
export async function ensureProject(admin: ProjectAdmin, name: string = PROJECT_NAME) {
  const [existing] = await admin.searchResources("Project", { "name:exact": name });
  if (existing?.id !== undefined) return { id: existing.id, created: false };
  const project: unknown = await admin.post(admin.fhirUrl("Project", "$init"), {
    resourceType: "Parameters",
    parameter: [{ name: "name", valueString: name }],
  });
  const id = stringField(project, "id");
  if (id === undefined) throw new Error("Medplum did not return the new project id");
  return { id, created: true };
}

/** A facility (an Organization), by key; the first one by default. */
export async function seedFacility(medplum: Medplum, key: string = FACILITY_KEY, name: string = "Demo Surgery Center (synthetic)") {
  const facility = await medplum.createResourceIfNoneExist(
    {
      resourceType: "Organization",
      name,
      identifier: identifierOf(key),
      type: [
        {
          coding: [{ system: "http://terminology.hl7.org/CodeSystem/organization-type", code: "prov", display: "Healthcare Provider" }],
        },
      ],
      active: true,
      meta: { tag: SYNTHETIC_TAG },
    },
    conditionOf(key),
  );
  if (facility.id === undefined) throw new Error("Medplum did not return the facility id");
  return facility.id;
}

/** Staff role keys: every role template except the patient role, which is a portal identity. */
export function staffRoleKeys(templates: readonly { readonly key: string }[]): string[] {
  return templates.map((template) => template.key).filter((key) => key !== "patient");
}

/** One synthetic practitioner per role key, named after the role so no one can mistake them for a person. */
export async function seedPractitioners(medplum: Medplum, roleKeys: readonly string[]) {
  const byRole: Record<string, string> = {};
  for (const roleKey of roleKeys) {
    const practitioner = await medplum.createResourceIfNoneExist(
      {
        resourceType: "Practitioner",
        name: [{ given: ["Synthetic"], family: `Demo-${roleKey}` }],
        identifier: identifierOf(`practitioner-${roleKey}`),
        active: true,
        meta: { tag: SYNTHETIC_TAG },
      },
      conditionOf(`practitioner-${roleKey}`),
    );
    if (practitioner.id === undefined) throw new Error("Medplum did not return a practitioner id");
    byRole[roleKey] = practitioner.id;
  }
  return byRole;
}

/** Reads and checks `infra/medplum/client-apps.json`. Throws on a malformed definition. */
export function parseClientAppDefinitions(json: unknown): ClientAppDefinition[] {
  const list = (json as { clientApplications?: unknown } | null)?.clientApplications;
  if (!Array.isArray(list) || list.length === 0) throw new Error("client-apps.json needs a non-empty clientApplications list");
  return list.map((entry: unknown, index) => {
    const item = entry as Record<string, unknown>;
    const text = (name: string) => {
      const value = item[name];
      if (typeof value !== "string" || value.length === 0) throw new Error(`client application #${index} needs a "${name}" string`);
      return value;
    };
    const policy = typeof item.policy === "string" && item.policy.length > 0 ? item.policy : undefined;
    const flag = (name: string) => {
      const value = item[name];
      if (typeof value !== "boolean") throw new Error(`client application #${index} needs a "${name}" boolean`);
      return value;
    };
    const redirectUri = typeof item.redirectUri === "string" ? item.redirectUri : undefined;
    const perFacility = item.perFacility === undefined ? false : flag("perFacility");
    const definition = {
      key: text("key"),
      name: text("name"),
      description: text("description"),
      ...(redirectUri === undefined ? {} : { redirectUri }),
      secret: flag("secret"),
      membership: flag("membership"),
      ...(policy === undefined ? {} : { policy }),
      ...(perFacility ? { perFacility } : {}),
    };
    if (perFacility && !(definition.secret && definition.membership && policy !== undefined)) {
      throw new Error(`client application ${definition.key} is per facility, so it needs a secret, a membership and a policy`);
    }
    return definition;
  });
}

/** Names of client applications that must no longer exist (`retiredClientApplications` in client-apps.json). */
export function parseRetiredClientApplications(json: unknown): string[] {
  const list = (json as { retiredClientApplications?: unknown } | null)?.retiredClientApplications;
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.some((name) => typeof name !== "string" || name.length === 0)) {
    throw new Error("retiredClientApplications must be a list of client application names");
  }
  return list as string[];
}

/**
 * Deletes retired client applications and their memberships, so their credentials stop working. Membership
 * first: a membership without its client would be an orphan. Safe to run again (nothing found, nothing done).
 */
export async function retireClientApplications(medplum: Medplum, names: readonly string[]): Promise<string[]> {
  const removed: string[] = [];
  for (const name of names) {
    for (const app of await medplum.searchResources("ClientApplication", { "name:exact": name })) {
      if (app.id === undefined) continue;
      for (const membership of await medplum.searchResources("ProjectMembership", { user: `ClientApplication/${app.id}` })) {
        if (membership.id !== undefined) await medplum.deleteResource("ProjectMembership", membership.id);
      }
      await medplum.deleteResource("ClientApplication", app.id);
      removed.push(name);
    }
  }
  return removed;
}

/** Expands per-facility definitions into one definition per facility; the others pass through. */
function expandPerFacility(
  definitions: readonly ClientAppDefinition[],
  facilities: readonly SeededFacility[],
): { definition: ClientAppDefinition; facilityId: string | undefined }[] {
  return definitions.flatMap((definition): { definition: ClientAppDefinition; facilityId: string | undefined }[] => {
    if (definition.perFacility !== true) return [{ definition, facilityId: undefined }];
    if (facilities.length === 0) throw new Error(`client application ${definition.key} is per facility, but no facility was seeded`);
    return facilities.map((facility) => ({
      definition: {
        ...definition,
        key: `${definition.key}@${facility.key}`,
        name: `${definition.name}@${facility.key}`,
        description: `${definition.description} Confined to facility ${facility.key}.`,
      },
      facilityId: facility.id,
    }));
  });
}

export const newSecret = () => randomBytes(24).toString("hex");

/**
 * Creates the client applications. Medplum does not generate a secret for an
 * application created through the API, so the seed sets one (once; an existing
 * secret is kept). A membership ties a confidential client to the project so its
 * client credentials work, and it always holds a narrow service policy: a client
 * with a membership and no policy would have full project access, so the seed
 * refuses to create one. An existing membership is corrected to the wanted policy. A per-facility definition
 * becomes one client per facility, its access entry naming that facility (`facilityId` in the result).
 */
export async function seedClientApplications(
  medplum: Medplum,
  projectId: string,
  definitions: readonly ClientAppDefinition[],
  policyIds: Readonly<Record<string, string>>,
  { facilities = [], secretFor = newSecret }: { readonly facilities?: readonly SeededFacility[]; readonly secretFor?: () => string } = {},
) {
  const result: Record<string, { id: string; secret?: string; facilityId?: string }> = {};
  for (const { definition, facilityId } of expandPerFacility(definitions, facilities)) {
    const [existing] = await medplum.searchResources("ClientApplication", { "name:exact": definition.name });
    const wanted = {
      name: definition.name,
      description: definition.description,
      ...(definition.redirectUri === undefined ? {} : { redirectUri: definition.redirectUri, pkceOptional: false }),
    };
    let app = existing;
    if (app === undefined) {
      app = await medplum.createResource({ resourceType: "ClientApplication", ...wanted });
    } else if (Object.entries(wanted).some(([key, value]) => (app as unknown as Record<string, unknown>)[key] !== value)) {
      app = await medplum.updateResource({ ...app, ...wanted });
    }
    if (app.id === undefined) throw new Error("Medplum did not return a client application id");
    if (definition.secret && (app.secret === undefined || app.secret.length === 0)) {
      app = await medplum.updateResource({ ...app, secret: secretFor() });
    }
    if (definition.membership) {
      if (definition.policy === undefined) {
        throw new Error(`client application ${definition.key} has a membership but no policy: refusing to create a full-access client`);
      }
      const policyId = policyIds[definition.policy];
      if (policyId === undefined) throw new Error(`policy ${definition.policy} of client application ${definition.key} was not seeded`);
      const access = [
        {
          policy: { reference: `AccessPolicy/${policyId}` },
          ...(facilityId === undefined ? {} : { parameter: [{ name: "facility", valueReference: { reference: `Organization/${facilityId}` } }] }),
        },
      ];
      const [membership] = await medplum.searchResources("ProjectMembership", { user: `ClientApplication/${app.id}` });
      if (membership === undefined) {
        await medplum.createResource({
          resourceType: "ProjectMembership",
          project: { reference: `Project/${projectId}` },
          user: { reference: `ClientApplication/${app.id}` },
          profile: { reference: `ClientApplication/${app.id}` },
          access,
        });
      } else if (!isDeepStrictEqual(membership.access, access)) {
        await medplum.updateResource({ ...membership, access });
      }
    }
    result[definition.key] = {
      id: app.id,
      ...(definition.secret && app.secret !== undefined ? { secret: app.secret } : {}),
      ...(facilityId === undefined ? {} : { facilityId }),
    };
  }
  return result;
}
