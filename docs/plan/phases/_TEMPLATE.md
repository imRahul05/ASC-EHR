# Pxx — <Phase name>

| Field | Value |
|---|---|
| Wave · Lane · Size | <0–4> · <Platform/Domain/UI/Clinical/AI/Integration/Infra> · <S/M> |
| Depends on | <phase IDs that must be `done` in PROGRESS.md> |
| Unblocks | <phase IDs> |
| Source mix | MS (MindScript) · MP (Medplum) · NEW (custom) |
| Requirements | <M.. / X.. IDs from 01-requirements> |
| Branch | `phase/Pxx-<slug>` |

## Goal
One or two sentences: the user-visible or platform outcome.

## Out of scope
What a sub-agent must not start here.

## File structure
```text
path/                     NEW|EDIT  purpose
```

## Tasks (one workspace per task → one sub-agent per task)
| ID | Task | Workspace | Output |
|---|---|---|---|

## Task dependency matrix
| Task | Depends on | Blocks | Parallel with |
|---|---|---|---|

## Packages to add
| Package | Version | Workspace |
|---|---|---|

## Acceptance (Definition of Done)
- [ ] `pnpm turbo run lint check-types test --filter=<workspaces>` green
- [ ] PROGRESS.md updated (status `done`, PR, follow-ups)
- [ ] LEARNING_MISTAKES.md updated if any correction happened

## Open questions
| ID | Question | Blocks task | Default if unanswered |
|---|---|---|---|
