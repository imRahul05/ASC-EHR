# IAM deferred phases (I18–I24) and their entry gates

These are real requirements, but building them before their gate is premature for Phase 1 (D-A11). Each gets a full phase file (same format as I01–I17, with a commit plan and checklist) **when its gate is reached**, not before.

| ID | Phase | Entry gate (start no later than) | Needs | 08 ref | Size |
|---|---|---|---|---|---|
| I18 | Machine identities: per-tenant worker `ClientApplication`, job context schema `{tenantId, facilityId, actor}` (IDs only), Bot policies | Before the first worker job that reads or writes PHI (P12 / P19) | I10, I11 | §9 | M |
| I19 | Realtime auth: SSE gates on subscribe, periodic re-validation, revocation bus, short-lived stream tickets, Medplum WS filtering | Before any SSE stream carries PHI (P10 consumers) | I11, S6 | §10 | M |
| I20 | Service-to-service kit: outbound signed 60 s JWT, inbound HMAC + timestamp + nonce, `/hooks/*` routes | Before P24 (fax, eCW) or any Medplum rest-hook | I08 | §11 | M |
| I21 | Hospital SSO: `DomainConfiguration` per tenant, invite / JIT mapping of IdP groups → role templates, SCIM if available | First customer that requires SSO (Q-IAM-6) | I10, I12, S2 | §5.3 | M |
| I22 | Break-glass and support access: 1 h elevation, mandatory reason, alert, auto-expiry, review queue | **Required for go-live** (M12-3, P26) | I13, I14, I15 | §12.1 | M |
| I23 | Patient identity for the portal: `%profile` policy, email magic link / OTP, `apps/portal` | Portal phase (P2) | I10, I12 | §5.4 | M |
| I24 | Tenant admin UI in `@asc/ui` (users, roles, facilities) replacing Medplum App for tenant admins | When tenant admins (not Wybit ops) must self-serve | I16 | I17 in 08 | M |

## Rules for deferred phases
- Do not add "just a little" of a deferred phase inside another phase. If a phase needs it, start the deferred phase.
- When a gate is reached, write its phase file from `docs/plan/phases/_TEMPLATE.md` plus the commit-plan and checklist sections used here, add it to [README §4](README.md#4-phase-map) and `PROGRESS.md`, then start.
- Silo deployment (`tenant.deployment = "silo"`) and tenant-specific custom roles stay out of scope until a contract requires them.
