# Working rules for Claude in this repo

See also `AGENTS.md` and `docs/PROGRESS.md`.

## Commit and push automatically

The owner has given standing permission: commit and push your work yourself, without asking.

- After each finished, working change, run `npm run build` (plus `npx vitest run` when `src/` or `tests/` changed). If they pass, commit and push.
- Commit in small, logical steps with a message that says what changed and why.
- Push with `git push -u origin <branch>`.
- Work on a feature branch, never directly on `main`. If the branch's pull request is already merged, start a new branch from the latest `main`.
- Never force-push, rewrite history, or commit secrets (`.env`, service keys, tokens).
- If the build or tests fail, fix them first. Never push a broken build; if it can't be fixed, say so instead.
- Merging into `main` deploys to production (Vercel). Open a pull request for it; merge only when the owner asks.
