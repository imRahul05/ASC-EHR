# I00 — Decide and amend the IAM design

| Field | Value |
|---|---|
| Track · Size | A (no Medplum) · S |
| Depends on | — |
| Unblocks | I01 (and so everything) |
| Requirements | M12-1, M12-2, M12-3 |
| Branch | `phase/I00-iam-decisions` |
| Owner type | Human decision-maker + one agent for the doc edits |

## Goal
Turn the proposed design (08 + ADR) into an accepted, internally consistent spec that matches the corrections D-A1…D-A11 in the [plan README §2](README.md#2-design-corrections-this-plan-applies-decided-in-i00), so no later phase has to guess.

## Out of scope
Any code. Any change to clinical phases other than P05's pointer.

## File structure
```text
docs/decisions/2026-10-xx-iam-design-amendments.md   NEW   records D-A1..D-A11 + answers to Q-IAM-*
docs/product/08-identity-access-and-tenancy.md       EDIT  §6.1 Principal, §7 roles/workspaces/lifecycle, §12 audit sink
docs/decisions/2026-10-03-medplum-as-identity-and-access-platform.md  EDIT  status → accepted (after sign-off)
docs/decisions/README.md                             EDIT  index
docs/plan/phases/P05-auth-roles.md                   EDIT  "superseded by IAM track" banner
docs/product/01-requirements.md                      EDIT  M12-1 role list matches D-A7
docs/product/07-mock-frontend.md                     EDIT  role table notes the mapping to D-A7
docs/plan/implementation-plan.md                     EDIT  link the IAM plan, P05 row → IAM
```

## Commit plan
| # | Commit | Touches | ~Lines |
|---|---|---|---|
| C1 | `docs(adr): add IAM design amendments ADR (proposed)` | new ADR | 150 |
| C2 | `docs(iam): per-facility grants in Principal (D-A1)` | 08 §6, §6.1 | 60 |
| C3 | `docs(iam): RoleKey as data, catalog location (D-A2, D-A3)` | 08 §7.1, §7.6 | 40 |
| C4 | `docs(iam): add workspace layer (D-A4)` | 08 new §7.7 | 80 |
| C5 | `docs(iam): role lifecycle: key, label, status, split/merge (D-A5, D-A6)` | 08 §8 | 80 |
| C6 | `docs(iam): canonical P1 role list and legacy mapping (D-A7)` | 08 §7.3, 01 M12-1, 07 | 50 |
| C7 | `docs(iam): audit sink and IAM event vocabulary (D-A8)` | 08 §12 | 60 |
| C8 | `docs(iam): session, revocation and step-up targets (D-A9, D-A10)` | 08 §5 | 30 |
| C9 | `docs(plan): mark P05 superseded by IAM track` | P05, implementation-plan | 20 |
| C10 | `docs(adr): accept IAM ADRs after sign-off` | both ADRs, decisions/README | 10 |

C10 lands **only** after the human sign-off is written into the ADR (name/role, date).

## Content each amendment must contain

**C2 Principal (D-A1)**
```ts
type Grant = {
  scope: { kind: "all" } | { kind: "facility"; facilityId: string };
  roleKeys: string[];          // display + audit only
  capabilities: Capability[];  // what this grant allows at this scope
};
type Principal = {
  kind: "staff" | "patient" | "service";
  tenantId: string; projectId: string; membershipId: string;
  profile: { type: "Practitioner" | "Patient" | "ClientApplication"; id: string };
  grants: Grant[];
  authTime: number;
  onBehalfOf?: { agentExecutionId: string };
};
// can(p, cap, { facilityId }) → true iff some grant has cap AND (scope all OR scope.facilityId === facilityId)
// can(p, cap) without facility → only grants with scope "all" count (fail closed)
```
Worked example in the doc: User X = `rn @ A`, `clinical-supervisor @ B` → `can(X,"staff.manage",{facilityId:A}) === false`.

**C4 Workspace layer (D-A4)**
- `WorkspaceDef = { key, label, requiresAny: Capability[], homeRoute, priority }` lives in `@asc/types`; nav and dashboard panels per workspace live in `apps/web` config.
- Resolution: workspaces whose `requiresAny` intersect the principal's capabilities at the **current facility**; default = user preference if allowed, else highest priority.
- Nav items declare `requires: Capability`; nav is filtered by capability, not by role or workspace.
- Persona is a product word only; it never appears in code.

**C5 Role lifecycle (D-A5)**
- `key` never changes (it is in policy names and memberships). Rename = change `label`.
- `version` bump → new compiled policy `<key>-v<n>`, provisioner repoints memberships, old policy kept until unreferenced.
- `status`: `active` → `deprecated` (cannot be newly assigned, still works) → `retired` (provisioner refuses while any membership uses it).
- Split: new templates + mapping file `{ from: "front-desk", to: ["receptionist","registration"], rule: "all" | "manual" }`; merge: the inverse.
- Every lifecycle op emits an audit event (C7 vocabulary).

**C6 Role list (D-A7) — legacy mapping for the mock**

| Legacy `UserRole` | New role key(s) |
|---|---|
| `SURGEON` | `gi-physician` |
| `ANESTHESIOLOGIST` | `anesthesia` (qualification MD/CRNA) |
| `NURSE` | `rn` |
| `ADMIN` | `admin`, `front-desk`, `coder` (demo presets get one each) |
| `PATIENT` | principal `kind: "patient"`, template `patient` |
| — | `tech`, `auditor` (new) |

**C7 IAM event vocabulary (D-A8)**
`auth.login`, `auth.logout`, `auth.denied`, `auth.mfa.enrolled`, `auth.stepup`, `user.invited`, `membership.created`, `membership.disabled`, `membership.enabled`, `membership.facility.added`, `membership.facility.removed`, `role.assigned`, `role.removed`, `role.template.published`, `role.template.deprecated`, `role.template.retired`, `tenant.provisioned`, `breakglass.started`, `breakglass.ended`.

## Checklist
- [ ] Q-IAM-1…5 and Q-IAM-A/B/C answered (or default accepted) and written in the ADR
- [ ] 08 has no remaining flat `capabilities: Set` in `Principal`
- [ ] 08, P05, 01 M12-1, 07 name the same role list
- [ ] Workspace layer section exists with resolution rule and example (Clinical Supervisor)
- [ ] Role lifecycle covers rename, version, deprecate, retire, split, merge, disable user
- [ ] Audit sink and event vocabulary written
- [ ] P05 banner points to this plan; implementation-plan links it
- [ ] Human sign-off recorded (name/role + date) in the ADR before C10
- [ ] Each commit ≤ 400 lines, docs only

## Acceptance
- A developer can answer "how do I add Technician?" from 08 alone.
- No contradiction between 08, P05, 01, 07 on roles, Principal or audit.

## Open questions
| ID | Question | Default |
|---|---|---|
| Q-IAM-1…C | See [README §8](README.md#8-decisions-needed-from-humans-i00-blocks-on-these) | As listed there |
