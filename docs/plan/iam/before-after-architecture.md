# Auth architecture — today vs after the IAM plan

> Snapshot 2026-10-05. **Today** = `main` (mock auth). **After** = [P05](../phases/P05-auth-roles.md) sub-phases P05a–P05j done: one hospital, tenant-ready ([index](README.md), design [08](../../product/08-identity-access-and-tenancy.md)). Multi-tenant host routing is a later step ([future doc](../../product/future-multi-tenancy-architecture.md)).

## 1. System view

### Today
```mermaid
flowchart LR
    U["Browser user"] --> W["apps/web (Next.js)"]
    W --> RA["RequireAuth<br/>client-side only"]
    W --> MSW["MSW mock in browser<br/>any email logs in<br/>bad token → ADMIN actor"]
    MSW --> MDB[("In-memory mock DB<br/>synthetic, resets on reload")]
    W -. "real API (unused for auth)" .-> API["apps/api<br/>/health only<br/>no authn, no guards"]
    API --> PG[("Postgres<br/>agent_runs, org_id nullable<br/>no RLS")]
    AUD["@asc/audit<br/>logger store only"]
    NAV["NAV_BY_ROLE / DASHBOARD_BY_ROLE<br/>keyed by 5-value UserRole"] --- W
```

### After
```mermaid
flowchart LR
    U["Browser"] --> W["apps/web<br/>Principal from /me · useCan · workspaces"]
    W -->|"PKCE + TOTP"| MA["Medplum Auth<br/>hardened config"]
    W -->|"Bearer (memory only)"| API
    subgraph API ["apps/api — default deny"]
        G1["1 tenant<br/>StaticTenantResolver"] --> G2["2 identity<br/>IdentityPort, cached ≤60 s"] --> G3["3 facility grant"] --> G4["4 capability<br/>can(p, cap, facility)"]
    end
    G4 -->|"user token"| G5["5 Medplum AccessPolicy<br/>compiled from role templates"]
    G5 --> FHIR[("FHIR store<br/>one Project now")]
    G4 --> PG[("App Postgres<br/>tenant_id + RLS")]
    G4 --> AUD[("audit_events<br/>append-only")]
```

## 2. Identity and permission model

### Today
```mermaid
flowchart LR
    UP["UserProfile<br/>role: one of 5<br/>facilityName: string"] --> UI["Nav + dashboard<br/>per role"]
    UP -. "no permissions" .-> X["UI hides links only"]
```

### After
```mermaid
flowchart LR
    ID["Identity<br/>Medplum User"] --> M["Membership<br/>per tenant"]
    M --> GA["Grant @ facility A<br/>role rn"]
    M --> GB["Grant @ facility B<br/>rn + clinical-supervisor"]
    RT["Role template<br/>versioned data"] --> CAP["Capabilities<br/>patient.read, note.sign …"]
    GA --> CAP
    GB --> CAP
    CAP --> WS["Workspace<br/>home, nav, dashboard"]
    CAP --> CAN["can(principal, cap, facility)"]
```

## 3. Request: nurse opens `/admin` by URL

### Today
```mermaid
sequenceDiagram
    actor N as Nurse
    participant W as apps/web
    participant M as MSW mock
    N->>W: type /admin
    W->>W: RequireAuth: signed in? yes
    W->>M: fetch admin data
    M-->>W: 200 data (no role check)
```

### After
```mermaid
sequenceDiagram
    actor N as Nurse
    participant W as apps/web
    participant A as apps/api
    N->>W: type /admin
    W->>W: RequireCapability(admin.users) → 403 screen
    N->>A: call API directly
    A->>A: gates 1–3 pass, gate 4 can() = false
    A-->>N: 403 + audit auth.denied (gate 4)
```

## 4. What changes, in one table

| Concern | Today | After |
|---|---|---|
| Login | Mock, any password | Medplum PKCE + TOTP (SSO later) |
| Roles | 5-value enum in code | Versioned templates (data) |
| Permissions | None | Capability catalog + `can()` |
| Multi-role / multi-facility | Impossible | Grants per facility |
| UI | Keyed by role | Workspaces from capabilities |
| API enforcement | None | 5 gates, default deny |
| Tenancy | None | One tenant via `StaticTenantResolver`; `tenant_id` + RLS ready; Project per tenant for Customer #2 |
| Audit | Logger only | Append-only table + Medplum AuditEvent (`saveAuditEvents: true`) |
| Add "Technician" | ~20 files | Template file + config |
