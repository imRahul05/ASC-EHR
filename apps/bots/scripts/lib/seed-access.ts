/**
 * Idempotent seeding of the access model of a LOCAL Medplum: one AccessPolicy per role template version
 * (compiled by `@asc/authz`), then demo users who hold those policies. Synthetic only. Medplum behaviours
 * relied on here are pinned by the live tests (`apps/bots/live`) and explained in
 * docs/decisions/2026-10-08-medplum-spike-results-and-fallbacks.md.
 */

import { isDeepStrictEqual } from "node:util";
import { compilePolicy } from "@asc/authz";
import type { MedplumClient } from "@medplum/core";
import type { AccessPolicy } from "@medplum/fhirtypes";

type RoleTemplate = Parameters<typeof compilePolicy>[0];
type Medplum = Pick<MedplumClient, "createResource" | "updateResource" | "searchResources">;

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
