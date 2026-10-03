---
status: proposed
date: 2026-10-03
decision-makers: Engineering lead (pending ratification)
---

# Use Medplum as the identity provider and data-authorization engine; tenant = Medplum Project

## Context and Problem Statement

The product must support several hospitals and ASC groups from one deployment, each with its own users, sites, roles and (later) single sign-on. Roles and workflow are not final. We need to choose where identities live and where authorization is enforced: Medplum Auth, an open-source library (Better Auth), a SaaS IdP (Clerk), or a self-hosted IdP (Keycloak). The adoption of Medplum as the clinical data platform is itself still proposed ([ADR](2026-09-25-adopt-medplum-as-clinical-data-platform.md)).

## Decision Drivers

- PHI authorization enforced at the data layer, not only in our code
- No second identity store to keep in sync with Medplum memberships
- One deployment, many tenants, hard isolation per customer
- Hospital SSO per tenant
- New roles and workflow changes without code changes
- BAA and data residency inside our Azure tenant

## Considered Options

1. **Medplum Auth + AccessPolicy**, tenant = Project, facility = Organization
2. Better Auth (self-hosted library) as IdP, bridged to Medplum
3. Clerk (SaaS) as IdP, bridged to Medplum
4. Keycloak as IdP, federated into Medplum

## Decision Outcome

Chosen option: **1**. The design is in [`docs/product/08-identity-access-and-tenancy.md`](../product/08-identity-access-and-tenancy.md).

- Each customer (the BAA holder) gets its own Medplum `Project`. Each site is an `Organization` within it, and every resource carries that site in `meta.accounts`.
- A role is a versioned *role template* in a new pure package, `@asc/authz`. A template holds a list of capabilities plus data rules. A policy compiler turns each template into a parameterized `AccessPolicy` (`%facility`) for each tenant.
- Code checks capabilities (`can(principal, "note.sign")`), never role names.
- Hospital SSO uses Medplum's `DomainConfiguration`. Without SSO, Medplum's TOTP MFA is required for every staff role.
- Machine callers use their own credentials, scoped to one tenant:
  - the worker uses one `ClientApplication` per tenant;
  - Bots run inside the Project;
  - webhooks are HMAC-signed;
  - outbound service calls use signed JWTs that expire after 60 s.
- Option 2 (Better Auth) is the fallback if we ever leave Medplum. An `IdentityPort` interface in `@asc/authz` keeps that switch contained.

### Consequences

- Good: a single policy decision point for PHI, with no identity sync and no super-user FHIR calls.
- Good: adding a tenant or a role is configuration, not a code change or a new deployment.
- Bad: on Medplum-hosted, domain SSO needs an Enterprise plan. This feeds into D1.
- Bad: some Medplum behaviours still need confirming (spikes S1–S5 in 08 §14) before the phases that depend on them start.
- Neutral: login UI is built in-house on `@medplum/core`, because `@medplum/react` stays banned.

### Confirmation

- Spikes S1–S5 pass on Medplum 5.1.42.
- I9 conformance suite: every role template × resource × action matches §7.4.
- I18 cross-tenant attack suite: no request using tenant A's token reaches tenant B's data, in any store.

## More Information

- Medplum Projects: https://www.medplum.com/docs/access/projects
- Access policies (parameterized, union of entries, `writeConstraint`): https://www.medplum.com/docs/access/access-policies
- Domain-level identity providers: https://www.medplum.com/docs/auth/domain-level-identity-providers
- Subscription signing (`x-signature` HMAC-SHA256): https://www.medplum.com/docs/subscriptions/subscription-extensions
