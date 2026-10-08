/**
 * Idempotent seeding of the access model of a LOCAL Medplum: one AccessPolicy per role template version
 * (compiled by `@asc/authz`), then demo users who hold those policies. Synthetic only. Medplum behaviours
 * relied on here are pinned by the live tests (`apps/bots/live`) and explained in
 * docs/decisions/2026-10-08-medplum-spike-results-and-fallbacks.md.
 */

import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { compilePolicy, ROLE_TEMPLATE_TAG_SYSTEM } from "@asc/authz";
import type { MedplumClient } from "@medplum/core";
import type { AccessPolicy, ProjectMembership } from "@medplum/fhirtypes";

import { conditionOf, identifierOf, SYNTHETIC_TAG } from "./seed.js";

type RoleTemplate = Parameters<typeof compilePolicy>[0];
type Medplum = Pick<MedplumClient, "createResource" | "updateResource" | "searchResources">;
type Directory = Pick<MedplumClient, "createResourceIfNoneExist" | "updateResource" | "searchResources" | "readResource" | "post">;

/**
 * One policy per template, named `<key>-v<version>`. Created when missing, rewritten when the compiled rules
 * differ (so a changed template is picked up), untouched otherwise. Older versions are left alone.
 * Returns the policy id by role key.
 */
export async function seedRolePolicies(medplum: Medplum, templates: readonly RoleTemplate[]): Promise<Record<string, string>> {
  const byRole: Record<string, string> = {};
  for (const template of templates) {
    // The compiler's readonly arrays are plain JSON; Medplum's generated types are mutable.
    const compiled = JSON.parse(JSON.stringify(compilePolicy(template))) as AccessPolicy;
    const [existing] = await medplum.searchResources("AccessPolicy", { "name:exact": compiled.name ?? "" });
    let policy = existing;
    if (policy === undefined) {
      policy = await medplum.createResource(compiled);
    } else if (!isDeepStrictEqual(policy.resource, compiled.resource)) {
      policy = await medplum.updateResource({ ...policy, ...compiled });
    }
    if (policy.id === undefined) throw new Error("Medplum did not return an access policy id");
    byRole[template.key] = policy.id;
  }
  return byRole;
}

/** A reserved example domain: nothing can be delivered to it. */
export const demoEmail = (roleKey: string) => `demo-${roleKey}@example.com`;
const newPassword = () => randomBytes(18).toString("base64url");

export type DemoUser = { email: string; password?: string };
type DemoUserInput = {
  readonly projectId: string;
  readonly facilityId: string;
  /** Policy id by role key (from `seedRolePolicies`). */
  readonly policies: Readonly<Record<string, string>>;
  /** Practitioner id by role key (from `seedPractitioners`). */
  readonly practitioners: Readonly<Record<string, string>>;
  readonly newPassword?: () => string;
};

/** The membership's access entry for a role: facility-scoped roles carry the `facility` parameter, all-site roles do not. */
function accessFor(template: RoleTemplate, policyId: string, facilityId: string): NonNullable<ProjectMembership["access"]> {
  return [
    {
      policy: { reference: `AccessPolicy/${policyId}` },
      ...(template.facilityScoped ? { parameter: [{ name: "facility", valueReference: { reference: `Organization/${facilityId}` } }] } : {}),
    },
  ];
}

/**
 * One demo user per role template: the seeded Practitioner gets a reserved-domain email (Medplum's invite
 * reuses the Practitioner with that email), a membership that holds the role's policy, and a `PractitionerRole`
 * with the role key and the facility. The `PractitionerRole` is the readable copy the identity adapter builds
 * grants from (ADR 2026-10-08, decision 4); the membership stays the source of enforcement. A password is
 * generated only when the user is first created and is returned once: it cannot be read back from Medplum.
 */
export async function seedDemoUsers(
  medplum: Directory,
  templates: readonly RoleTemplate[],
  input: DemoUserInput,
): Promise<Record<string, DemoUser>> {
  const users: Record<string, DemoUser> = {};
  for (const template of templates) {
    const practitionerId = input.practitioners[template.key];
    const policyId = input.policies[template.key];
    if (practitionerId === undefined || policyId === undefined) throw new Error(`no practitioner or policy seeded for role ${template.key}`);
    const email = demoEmail(template.key);
    const profile = `Practitioner/${practitionerId}`;

    const practitioner = await medplum.readResource("Practitioner", practitionerId);
    if (!practitioner.telecom?.some((telecom) => telecom.system === "email" && telecom.value === email)) {
      await medplum.updateResource({ ...practitioner, telecom: [...(practitioner.telecom ?? []), { system: "email", value: email }] });
    }

    const access = accessFor(template, policyId, input.facilityId);
    const [membership] = await medplum.searchResources("ProjectMembership", { profile });
    if (membership === undefined) {
      const password = (input.newPassword ?? newPassword)();
      await medplum.post(`admin/projects/${input.projectId}/invite`, {
        resourceType: "Practitioner",
        firstName: "Synthetic",
        lastName: `Demo-${template.key}`,
        email,
        password,
        sendEmail: false,
        membership: { access },
      });
      users[template.key] = { email, password };
    } else {
      if (!isDeepStrictEqual(membership.access, access)) await medplum.updateResource({ ...membership, access });
      users[template.key] = { email };
    }

    const scope = template.facilityScoped ? input.facilityId : "all";
    await medplum.createResourceIfNoneExist(
      {
        resourceType: "PractitionerRole",
        practitioner: { reference: profile },
        ...(template.facilityScoped ? { organization: { reference: `Organization/${input.facilityId}` } } : {}),
        code: [{ coding: [{ system: ROLE_TEMPLATE_TAG_SYSTEM, code: template.key }] }],
        identifier: identifierOf(`role-${template.key}-${scope}`),
        meta: { tag: SYNTHETIC_TAG },
      },
      conditionOf(`role-${template.key}-${scope}`),
    );
  }
  return users;
}

/**
 * Demo users for the output file: a password just generated wins, otherwise the one from the previous output
 * (Medplum cannot return it), and a user whose email changed or who is new without a password gets none.
 */
export function mergeDemoUsers(previous: unknown, created: Readonly<Record<string, DemoUser>>): Record<string, DemoUser> {
  const before = (typeof previous === "object" && previous !== null ? (previous as { users?: unknown }).users : undefined) ?? {};
  const merged: Record<string, DemoUser> = {};
  for (const [role, user] of Object.entries(created)) {
    const old = typeof before === "object" && before !== null && Object.hasOwn(before, role) ? (before as Record<string, unknown>)[role] : undefined;
    const oldUser = typeof old === "object" && old !== null ? (old as Partial<DemoUser>) : {};
    const password = user.password ?? (oldUser.email === user.email ? oldUser.password : undefined);
    merged[role] = { email: user.email, ...(password === undefined ? {} : { password }) };
  }
  return merged;
}
