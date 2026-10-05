# I02 — Role templates and the role × capability matrix

| Field | Value |
|---|---|
| Track · Size | A · M |
| Depends on | I01 |
| Unblocks | I03, I05 |
| Requirements | M12-1, M12-2 |
| Branch | `phase/I02-role-templates` |

## Goal
The eight P1 staff role templates plus the `patient` template exist as versioned, validated data in `@asc/authz`. A matrix test pins role × capability to the table in 08 §7.3, so any change is a reviewed diff.

## Out of scope
Compiling to AccessPolicy (I03), UI (I05), tenant-specific roles (deferred).

## File structure
```text
packages/types/src/authz.ts                   EDIT  RoleTemplate, ResourceRule, RoleStatus types
packages/validation/src/authz.ts              EDIT  roleTemplateSchema (unknown capability rejected, key format, version ≥ 1)
packages/authz/src/roles/index.ts             NEW   ROLE_TEMPLATES registry, getTemplate(key), activeTemplates()
packages/authz/src/roles/<key>.ts             NEW   one file per template: front-desk, rn, tech, gi-physician, anesthesia, coder, admin, auditor, patient
packages/authz/src/roles/registry.test.ts     NEW   unique keys, schema-valid, status rules
packages/authz/src/roles/matrix.test.ts       NEW   role × capability snapshot vs 08 §7.3
packages/authz/src/principal-from-grants.ts   NEW   buildGrants(assignments, templates) → Grant[]
```

## Template shape
```ts
const rn: RoleTemplate = {
  key: "rn",                 // immutable
  label: "Registered Nurse", // free to rename
  version: 1,
  status: "active",          // active | deprecated | retired
  replacedBy: undefined,
  facilityScoped: true,
  requiresMfa: true,
  capabilities: ["patient.read", "case.read", "case.advance", "hp.document", ...],
  data: [ { resourceType: "Composition", access: "read" }, ... ], // input to I03
};
```

## Commit plan
| # | Commit | Workspace | ~Lines |
|---|---|---|---|
| C1 | `feat(types): add RoleTemplate and ResourceRule types` | `@asc/types` | 60 |
| C2 | `feat(validation): add role template schema with tests` | `@asc/validation` | 130 |
| C3 | `feat(authz): add role template registry and loader` | `@asc/authz` | 100 |
| C4 | `feat(authz): add front-desk role template` | `@asc/authz` | 50 |
| C5 | `feat(authz): add rn role template` | `@asc/authz` | 50 |
| C6 | `feat(authz): add tech role template` | `@asc/authz` | 40 |
| C7 | `feat(authz): add gi-physician role template` | `@asc/authz` | 60 |
| C8 | `feat(authz): add anesthesia role template` | `@asc/authz` | 50 |
| C9 | `feat(authz): add coder role template` | `@asc/authz` | 40 |
| C10 | `feat(authz): add admin and auditor role templates` | `@asc/authz` | 70 |
| C11 | `feat(authz): add patient template for portal principals` | `@asc/authz` | 40 |
| C12 | `feat(authz): build grants from role assignments` | `@asc/authz` | 120 |
| C13 | `test(authz): pin role x capability matrix` | `@asc/authz` | 80 + snapshot |

Each template commit includes its registry test update. C12 tests: one user with two roles at one facility (union), two facilities with different roles (separate grants), `facilityScoped: false` → `scope: all`.

## Checklist
- [ ] Every capability in every template exists in the catalog (schema rejects others)
- [ ] Keys are kebab-case, unique, never reused after retirement (registry test)
- [ ] `retired` templates cannot be loaded into a new grant; `deprecated` loads with a warning flag
- [ ] Matrix snapshot equals 08 §7.3 (after I00 amendments); diff reviewed in PR
- [ ] `patient` template only holds `portal.*` capabilities (test)
- [ ] No template file over 80 lines; no logic in template files (data only)
- [ ] Green at every commit; PROGRESS.md updated

## Acceptance
- Adding a ninth role = one new file + one registry line + matrix snapshot update. Prove it in the PR description by listing the diff for `tech` (C6).
