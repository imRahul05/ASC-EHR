# I04 — Workspace layer (persona ≠ role ≠ capability ≠ UI)

| Field | Value |
|---|---|
| Track · Size | A · S |
| Depends on | I01 |
| Unblocks | I05 |
| Requirements | 07 §2 (role home), D-A4 |
| Branch | `phase/I04-workspaces` |

## Goal
A pure resolver that picks which workspaces (home route + dashboard + nav profile) a principal may use at the current facility, from capabilities only. A Clinical Supervisor with physician + staff-management capabilities gets both workspaces without a new role-specific code path.

## Out of scope
React components and the actual nav/dashboard config (I05). Persisting user preference server-side (later; mock keeps it in memory).

## File structure
```text
packages/types/src/authz.ts                 EDIT  WorkspaceKey (string), WorkspaceDef { key, label, requiresAny, homeRoute, priority }
packages/validation/src/authz.ts            EDIT  workspacePreferenceSchema
packages/authz/src/workspaces/resolve.ts    NEW   availableWorkspaces(principal, defs, facilityId), defaultWorkspace(...)
packages/authz/src/workspaces/resolve.test.ts NEW
packages/authz/README.md                    EDIT  "Persona, role, capability, workspace" section
```

## Commit plan
| # | Commit | Workspace | ~Lines |
|---|---|---|---|
| C1 | `feat(types): add workspace definition types` | `@asc/types` | 40 |
| C2 | `feat(authz): resolve available workspaces from capabilities` | `@asc/authz` | 110 |
| C3 | `feat(authz): pick default workspace with user preference` | `@asc/authz` | 70 |
| C4 | `feat(validation): add workspace preference schema` | `@asc/validation` | 40 |
| C5 | `docs(authz): explain persona, role, capability, workspace` | `@asc/authz` | 60 |

## Tests must prove
- Workspace with `requiresAny: ["note.sign"]` appears for `gi-physician`, not for `rn`.
- Supervisor (rn caps + `admin.users`) gets `nursing` and `staff-admin` workspaces.
- At facility A (where X is only `rn`) X does **not** see `staff-admin`; at B they do.
- Preference for an unavailable workspace falls back to the highest-priority available one.
- Patient principal gets only `portal`.

## Checklist
- [ ] Resolver takes `WorkspaceDef[]` as input (no hardcoded workspace list in `@asc/authz`)
- [ ] No role key referenced in resolver code or tests' assertions (only capabilities)
- [ ] README has the four-concept table and the Clinical Supervisor example
- [ ] Green at every commit; PROGRESS.md updated
