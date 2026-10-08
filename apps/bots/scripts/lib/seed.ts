/**
 * Idempotent seeding of a LOCAL Medplum with synthetic data. Every create is
 * conditional (by identifier or name), so running the seed again changes nothing.
 * Synthetic only: no real names, dates of birth or identifiers.
 */

import { randomBytes } from "node:crypto";
import type { MedplumClient } from "@medplum/core";

export const SEED_SYSTEM = "urn:asc-ehr:seed";
export const PROJECT_NAME = "ASC EHR (local)";
export const FACILITY_KEY = "facility-demo-1";
/** A second facility, so tests can prove that a user at the first cannot reach the second. */
export const SECOND_FACILITY_KEY = "facility-demo-2";

/** The narrow slice of the Medplum client the seed uses (so tests can fake it). */
type Medplum = Pick<
  MedplumClient,
  "createResourceIfNoneExist" | "createResource" | "updateResource" | "searchResources"
>;
type ProjectAdmin = Pick<MedplumClient, "searchResources" | "post" | "fhirUrl">;

type ClientAppDefinition = {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly redirectUri?: string;
  readonly secret: boolean;
  readonly membership: boolean;
};

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
    const flag = (name: string) => {
      const value = item[name];
      if (typeof value !== "boolean") throw new Error(`client application #${index} needs a "${name}" boolean`);
      return value;
    };
    const redirectUri = typeof item.redirectUri === "string" ? item.redirectUri : undefined;
    return {
      key: text("key"),
      name: text("name"),
      description: text("description"),
      ...(redirectUri === undefined ? {} : { redirectUri }),
      secret: flag("secret"),
      membership: flag("membership"),
    };
  });
}

export const newSecret = () => randomBytes(24).toString("hex");

/**
 * Creates the client applications. Medplum does not generate a secret for an
 * application created through the API, so the seed sets one (once; an existing
 * secret is kept). A membership ties a confidential client to the project so its
 * client credentials work. No access policy yet: P05h and P04 narrow these.
 *
 * TODO(P05h): give `asc-ehr-api` and `asc-ehr-worker` least-privilege AccessPolicies (no full-project
 * access) and prove it with a policy test. These full-access clients are for local development only:
 * never use them in another environment; staging and production clients get narrow policies from day one.
 */
export async function seedClientApplications(
  medplum: Medplum,
  projectId: string,
  definitions: readonly ClientAppDefinition[],
  secretFor: () => string = newSecret,
) {
  const result: Record<string, { id: string; secret?: string }> = {};
  for (const definition of definitions) {
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
      const memberships = await medplum.searchResources("ProjectMembership", { user: `ClientApplication/${app.id}` });
      if (memberships.length === 0) {
        await medplum.createResource({
          resourceType: "ProjectMembership",
          project: { reference: `Project/${projectId}` },
          user: { reference: `ClientApplication/${app.id}` },
          profile: { reference: `ClientApplication/${app.id}` },
        });
      }
    }
    result[definition.key] = { id: app.id, ...(definition.secret && app.secret !== undefined ? { secret: app.secret } : {}) };
  }
  return result;
}
