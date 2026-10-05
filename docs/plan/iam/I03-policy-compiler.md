# I03 — Policy compiler: role template → Medplum AccessPolicy JSON

| Field | Value |
|---|---|
| Track · Size | A · M |
| Depends on | I02 |
| Unblocks | I09, I10, I15 |
| Requirements | M12-2 (field-level), 03 §6 |
| Branch | `phase/I03-policy-compiler` |

## Goal
A pure, deterministic function `compilePolicy(template) → AccessPolicy` that produces the parameterised Medplum policy (`%facility`) for each template. Output is snapshot-tested and stable, so the provisioner (I10) can diff it.

## Out of scope
Uploading to Medplum (I10), proving Medplum honours it (I09, I15). No `@medplum/*` dependency yet: a minimal local `AccessPolicyJson` type is used and replaced by `@medplum/fhirtypes` in I10.

## File structure
```text
packages/authz/src/compiler/types.ts          NEW   AccessPolicyJson (minimal subset we emit)
packages/authz/src/compiler/compile.ts        NEW   compilePolicy(template), policyName(template)
packages/authz/src/compiler/rules.ts          NEW   ResourceRule → AccessPolicy.resource entry
packages/authz/src/compiler/constraints.ts    NEW   writeConstraint library (signed note immutable, …)
packages/authz/src/compiler/*.test.ts         NEW
packages/authz/src/compiler/__snapshots__/    NEW   one JSON per template
packages/authz/scripts/print-policies.ts      NEW   `pnpm --filter @asc/authz policies:print`
```

## Commit plan
| # | Commit | ~Lines |
|---|---|---|
| C1 | `feat(authz): add AccessPolicy JSON types for the compiler` | 60 |
| C2 | `feat(authz): compile resource rules with facility criteria` | 130 |
| C3 | `feat(authz): compile readonly and hidden fields` | 90 |
| C4 | `feat(authz): add write constraints (signed note immutable)` | 100 |
| C5 | `feat(authz): omit facility criteria for all-site roles` | 50 |
| C6 | `feat(authz): name and tag policies by key and version` | 60 |
| C7 | `test(authz): snapshot compiled policy per template` | 40 + snapshots |
| C8 | `test(authz): compiler output is deterministic` | 60 |
| C9 | `chore(authz): add policies:print script` | 40 |

## Rules the compiler enforces
- Name `<key>-v<version>`; `meta.tag` `{system: https://asc-ehr.app/role-template, code: key, version}`.
- Facility-scoped templates: every resource entry has `criteria: "<Type>?_compartment=%facility"` (final syntax confirmed by I09 S1; compiler isolates it in one function).
- Resources not listed in a template are **absent** (Medplum default-deny), never `"*"`.
- `patient` template uses `%profile` criteria instead of `%facility`.
- Output keys sorted; arrays in template order → byte-identical output for identical input.

## Checklist
- [ ] No wildcard resource type in any compiled policy (test)
- [ ] `Composition` hidden for `front-desk` (test)
- [ ] Signed-note `writeConstraint` present on every template that can write `Composition` (test)
- [ ] Facility criteria present on all facility-scoped templates, absent on `coder`, `admin`, `auditor` (test)
- [ ] Snapshots reviewed in PR (generated files excluded from the 400-line cap)
- [ ] Green at every commit; PROGRESS.md updated

## Open questions
| ID | Question | Default |
|---|---|---|
| Q-I03-1 | Exact facility criteria syntax (`_compartment` vs `meta.account`) | Isolated in one function; I09 S1 decides |
