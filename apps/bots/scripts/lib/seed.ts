/**
 * Idempotent seeding of a LOCAL Medplum with synthetic data. Every create is
 * conditional (by identifier or name), so running the seed again changes nothing.
 * Synthetic only: no real names, dates of birth or identifiers.
 */

import type { MedplumClient } from "@medplum/core";

export const SEED_SYSTEM = "urn:asc-ehr:seed";
export const PROJECT_NAME = "ASC EHR (local)";
export const FACILITY_KEY = "facility-demo-1";

/** The narrow slice of the Medplum client the seed uses (so tests can fake it). */
type Medplum = Pick<MedplumClient, "createResourceIfNoneExist">;
type ProjectAdmin = Pick<MedplumClient, "searchResources" | "post" | "fhirUrl">;

const SYNTHETIC_TAG = [{ system: SEED_SYSTEM, code: "synthetic", display: "Synthetic seed data" }];
const identifierOf = (value: string) => [{ system: SEED_SYSTEM, value }];
const conditionOf = (value: string) => `identifier=${SEED_SYSTEM}|${value}`;

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

/** The facility (an Organization): P05h seeds the real facilities and policies. */
export async function seedFacility(medplum: Medplum) {
  const facility = await medplum.createResourceIfNoneExist(
    {
      resourceType: "Organization",
      name: "Demo Surgery Center (synthetic)",
      identifier: identifierOf(FACILITY_KEY),
      type: [
        {
          coding: [{ system: "http://terminology.hl7.org/CodeSystem/organization-type", code: "prov", display: "Healthcare Provider" }],
        },
      ],
      active: true,
      meta: { tag: SYNTHETIC_TAG },
    },
    conditionOf(FACILITY_KEY),
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
