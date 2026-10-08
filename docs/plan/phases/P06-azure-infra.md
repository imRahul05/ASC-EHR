# P06 — Azure infra (Terraform) — dev environment

| Field | Value |
|---|---|
| Wave · Lane · Size | 1 · Infra · M (long-running lane, one owner) |
| Depends on | — (P02 for config parity) |
| Unblocks | P26 (staging/prod copies) |
| Source mix | MP (Medplum Azure Terraform path) |
| Requirements | ADR environments; 03 §7; D1 |
| Branch | `phase/P06-azure-infra` |

## Goal
Reproducible dev environment in Azure: AKS running medplum-server + api + worker, Postgres Flexible, Redis, Blob, Key Vault, App Gateway/WAF, static web. Staging/prod are copies with different vars (done in P26).

## Out of scope
Production cut-over, on-prem Agent (P1.5).

## File structure
```text
infra/terraform/modules/{network,aks,postgres,redis,storage,keyvault,appgw,monitor}/  NEW
infra/terraform/envs/dev/{main.tf,variables.tf,backend.tf}                             NEW
infra/k8s/{medplum-server,api,worker}/*.yaml (or Helm values)                          NEW
apps/api/Dockerfile · apps/worker/Dockerfile                                           NEW multi-stage (tsup output)
.github/workflows/deploy-dev.yml                                                       NEW
docs/ENVIRONMENTS_AND_DEPLOYMENT.md                                                    EDIT
```

## Tasks
| ID | Task | Workspace | Output |
|---|---|---|---|
| T1 | Terraform modules + dev env (state in Azure storage) | `infra/terraform` | `terraform plan` clean |
| T2 | Dockerfiles for api/worker | `apps/api`, `apps/worker` | images build |
| T3 | K8s manifests / Helm values incl. Medplum server | `infra/k8s` | pods healthy |
| T4 | Deploy workflow (OIDC to Azure, no long-lived secrets) | `.github` | deploy on main |
| T5 | Env doc update | docs | runbook |

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|
| T1 | — | T3, T4 | T2 |
| T2 | — | T4 | T1, T3 |
| T3 | T1 | T4 | T2 |
| T4 | T1, T2, T3 | P26 | T5 |
| T5 | T3 | — | T4 |

## Packages to add
None (Terraform providers: `azurerm` latest 4.x; pin in `versions.tf`).

## Acceptance
- [ ] `terraform apply` from clean state creates dev env
- [ ] Only synthetic data in dev/staging (environments ADR)
- [ ] Key Vault holds all secrets; nothing in repo
- [ ] Medplum config in every environment carries the P05h hardening: `registerEnabled: false`, `saveAuditEvents: true`, `storeBotInput: false`, super-admin credentials from Key Vault (Medplum defaults are unsafe — see [P05h](P05-auth-roles.md#p05h--medplum-hardening-spikes-seed-policy-test--m--needs-p05c-p02))
- [ ] Service clients (`asc-ehr-api`, `asc-ehr-worker`) are provisioned from `infra/medplum/service-policies.json`, never with full project access, and every Medplum config passes the hardening test (`apps/bots/scripts/lib/hardening.test.ts`); P05h decisions 2 and 8
- [ ] API behind Front Door or Application Gateway: set `trustProxy` to the proxy range and revisit `RATE_LIMIT_IP_MAX` (1200). Until then the per-address flood limit sees the proxy's address and is coarse ([P05g decisions](P05-auth-roles.md), item 9)
- [ ] Staff roles in staging and production are assigned only through the role-assignment reconciler (or, until it exists, an ops script run with ops credentials that writes the membership and the `PractitionerRole` together). No staff role, `admin` included, can write `PractitionerRole` (PR #61), and editing a membership in the Medplum App by hand creates drift ([P05 follow-ups](P05-auth-roles.md), reconciler row)
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| D1/Q10 | Self-host vs Medplum-hosted | all | **Decided 2026-10-03: self-host only**, no hosted fallback |
| Q1 | Azure subscription + BAA ready? | T1 | Needed week 1 — escalate |
| Q2 | AKS vs Container Apps for api/worker | T3 | AKS (same cluster as Medplum) |
