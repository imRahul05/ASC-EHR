---
status: proposed
date: 2026-10-03 (amended 2026-10-05)
decision-makers: Engineering lead (pending ratification — record name and date here, then set status to accepted)
---

# Use Medplum as the identity provider and data-authorization engine; tenant = Medplum Project

## Context and Problem Statement

The product must support clinical workflows for our initial hospital / ASC customer, and scale to more hospitals and ASC groups later without rewriting schemas or authorization code. Roles and workflows are not final, so they must change without hardcoded role unions. We need to choose where identities live and where authorization is enforced: Medplum Auth, an open-source library (Better Auth), a SaaS IdP (Clerk), or a self-hosted IdP (Keycloak).

## Decision Drivers

- PHI authorization enforced at the data layer, not only in our code
- No second identity store to keep in sync with Medplum memberships
- Tenant-ready contracts (`tenant_id`, `facility_id`, `Organization` compartments, `TenantResolver` port) with no hospital hardcoded
- Go-live for the first hospital without building multi-tenant SaaS tooling first
- New roles and permission changes as data, not code rewrites
- BAA and data residency inside our Azure tenant
- Prefer battle-tested open source we run ourselves over a hosted vendor

## Considered Options

1. **Medplum Auth + AccessPolicy**, tenant = Project, facility = Organization
2. Better Auth (self-hosted library) as IdP, bridged to Medplum
3. Clerk (SaaS) as IdP, bridged to Medplum
4. Keycloak as IdP, federated into Medplum

## Decision Outcome

Chosen option: **1**, running **self-hosted open-source Medplum** (upstream `medplum/medplum-server` images, Apache-2.0) in our Azure subscription. The Medplum-hosted service is not used. Design: [`08-identity-access-and-tenancy.md`](../product/08-identity-access-and-tenancy.md).

### Scope (2026-10-05 amendment)

1. **One hospital now, tenant-ready contracts.** One Medplum Project, resolved by a `StaticTenantResolver` from config. Subdomain routing, tenant registry, multi-project provisioner and cross-tenant attack suites wait for Customer #2 ([`future-multi-tenancy-architecture.md`](../product/future-multi-tenancy-architecture.md)).
2. **Tenant-ready data.** App tables carry `tenant_id uuid NOT NULL` + `facility_id` with Postgres RLS (`withTenant()`); FHIR resources carry the facility `Organization` in `meta.accounts`; `Principal` carries facility-scoped grants.
3. **Capabilities + role templates.** Role templates are versioned data in `@asc/authz`, compiled to parameterized `AccessPolicy` resources. Code checks `can(principal, capability, { facilityId })`, never role names.
4. **Five gates.** Tenant, identity, facility, capability (+ workflow) in `apps/api`; Medplum `AccessPolicy` on every FHIR call.
5. **Ports keep it replaceable.** `IdentityPort` (Medplum adapter now; Better Auth is the fallback if we leave Medplum) and `TenantResolver` (static now, host-based later) live in `@asc/authz`.
6. **Medplum is hardened, not run on defaults.** `registerEnabled: false`, `saveAuditEvents: true`, `storeBotInput: false`, super-admin credentials set explicitly and kept out of app runtime ([server config](https://www.medplum.com/docs/self-hosting/server-config)).
7. **Plan:** [`P05-auth-roles.md`](../plan/phases/P05-auth-roles.md) (sub-phases P05a–P05h).

### Consequences

- Good: one policy decision point for PHI, no identity sync, no super-user FHIR calls.
- Good: first-hospital go-live without multi-tenant tooling.
- Good: adding Customer #2 adds pieces (registry migration, host resolver, provisioner, DNS) but does not change clinical schemas or authorization code.
- Bad: we operate Medplum ourselves (upgrades, backups, config hardening, email sender, super-admin credential).
- Bad: some Medplum behaviours are unconfirmed until the P05g spikes run; each failed spike needs a recorded fallback.
- Neutral: login UI is built in-house on `@medplum/core` with `@asc/ui`; `@medplum/react` stays banned.

### Confirmation

- P05g spikes S1 (facility compartment + `writeConstraint` + auth-time claim), S1b (union of access entries) and S7 (`/auth/me` payload) pass on Medplum 5.1.42, or a fallback is recorded here.
- P05g policy test passes against local Medplum: front-desk cannot read `Composition`; an `rn` at facility A cannot read facility B resources.
- P05g config test passes: the four hardening settings above are present in every environment's Medplum config.
- Ratified by the engineering lead (name and date in the front matter).

## More Information

- Medplum Projects: https://www.medplum.com/docs/access/projects
- Access policies (parameterized, union of entries, `writeConstraint`): https://www.medplum.com/docs/access/access-policies
- Domain-level identity providers: https://www.medplum.com/docs/auth/domain-level-identity-providers
- Subscription signing (`x-signature` HMAC-SHA256): https://www.medplum.com/docs/subscriptions/subscription-extensions
- Server config (defaults: `registerEnabled` true, `saveAuditEvents` false, `storeBotInput` true): https://www.medplum.com/docs/self-hosting/server-config
