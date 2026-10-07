import { buildGrants, roleRegistry, ROLE_TEMPLATES } from "@asc/authz";
import { FakeIdentityPort } from "@asc/authz/testing";
import type { TenantRef } from "@asc/types";

/** The one synthetic facility the dev identities hold their roles at. */
export const DEV_FACILITY_ID = "demo-facility-1";

/**
 * LOCAL DEVELOPMENT ONLY. A fake `IdentityPort` with one synthetic staff identity per
 * role template: token `dev-<roleKey>` (for example `dev-rn`) holds that role at
 * `DEV_FACILITY_ID`. It validates nothing, so it must never run where real data
 * exists: the server refuses it in staging and production. The real adapter
 * (Medplum, P05i) replaces it.
 */
export class DevIdentityPort extends FakeIdentityPort {
  constructor(tenant: TenantRef) {
    super();
    for (const template of ROLE_TEMPLATES) {
      // The patient role is a portal identity, not a staff one.
      if (template.key === "patient") continue;
      this.addToken(`dev-${template.key}`, {
        kind: "staff",
        id: `dev-${template.key}`,
        membershipId: `dev-membership-${template.key}`,
        tenant,
        grants: buildGrants([{ roleKey: template.key, facilityId: DEV_FACILITY_ID }], roleRegistry),
      });
    }
  }
}
