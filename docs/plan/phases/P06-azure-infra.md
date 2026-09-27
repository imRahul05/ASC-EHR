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
- [ ] PROGRESS.md updated

## Open questions
| ID | Question | Blocks | Default |
|---|---|---|---|
| D1/Q10 | Self-host vs Medplum-hosted | all | Self-host; fallback trigger: slips past week 3 |
| Q1 | Azure subscription + BAA ready? | T1 | Needed week 1 — escalate |
| Q2 | AKS vs Container Apps for api/worker | T3 | AKS (same cluster as Medplum) |
