---
name: git
description: Git workflow with conventional commits, branching strategy, and clean history
---

- Use Conventional Commits: `type(scope): description`
- Keep commit summaries under 50 characters.
- Use feature branches — never commit directly to main/master.
- Run `git status` and `git diff` before every commit.
- Use `git stash` for temporary work-in-progress, not for permanent changes.
- Squash and rebase before merging to keep history clean.
- Tag releases with semantic versioning: `v1.2.3`
- Never commit secrets, build artifacts, or IDE files.
