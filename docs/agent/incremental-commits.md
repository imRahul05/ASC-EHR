# Incremental Commits and Checkpoints

This guide defines the expected behavior for committing code, especially during long or multi-step tasks. 

## 1. Atomic, Logical Commits
- Prefer small, logical, atomic commits over one massive final commit.
- Commit after a coherent unit of work is completed and verified (e.g., a database schema change, a feature layer, an API endpoint, or a UI component).
- Do not create meaningless commits for every tiny edit. Commits should represent independently understandable and useful progress.

## 2. Checkpoints During Long Tasks
- A long-running task should generally remain on a single branch, but the work must be divided into meaningful checkpoints.
- Before transitioning into another substantial phase of a task, recognize that the previous phase can be committed.
- **Proactive Suggestions:** If substantial work has accumulated without a commit, proactively summarize what has been completed and suggest committing the current checkpoint before continuing.
  - *Example phrasing:* "This phase is complete and verified. I recommend committing this checkpoint before we move on to the next step. Shall I commit these changes?"
- Never silently accumulate a large uncommitted diff simply because the overall task isn't fully finished.

## 3. User Override & Push Policies
- **Respect User Intent:** If the user explicitly asks to continue without committing, respect that instruction.
- **Pushing Changes:** Never push to a remote repository unless explicitly instructed by the user or unless a specific repository policy dictates it for the current workflow.

## 4. Size Limits and Commit Shape

These limits apply to every phase in [`docs/plan/`](../plan/) (they are mandatory for the [auth track, P05](../plan/iam/README.md#3-commit-rules)).

| Rule | Limit |
|---|---|
| Concern per commit | One. No feature + refactor, no code + unrelated docs, no `PROGRESS.md` mixed with code. |
| Workspaces per commit | One package or app. Exception: a contract change plus the minimal consumer fix that keeps the build green. |
| Changed lines | Target ≤ 150, **hard cap 400** (excluding lockfiles, generated snapshots and generated migration SQL). Over the cap → split before committing. |
| State after each commit | Green: `pnpm turbo run lint check-types test --filter=<touched workspaces>`; web changes also load in `pnpm dev`. |
| Tests | In the same commit as the code they prove. |
| Message | `type(scope): imperative summary` ≤ 72 chars (`feat fix refactor test docs chore perf`); body says why; optional `Refs: I05-C4`. |
| Risky changes | Expand → migrate callers → contract, each its own commit (DB columns, shared types, renamed APIs). |
| WIP / fixups | Never pushed. Use `git commit --fixup` and autosquash before pushing. |

If a phase file lists a commit plan, follow its order; if a planned commit turns out bigger than the cap, split it and note the split in the PR description.

*For simple, quick tasks, keep interactions lightweight and commit at the end. For complex orchestrations, use these guidelines to maintain a clean git history and safe rollback points.*
