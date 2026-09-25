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

*For simple, quick tasks, keep interactions lightweight and commit at the end. For complex orchestrations, use these guidelines to maintain a clean git history and safe rollback points.*
