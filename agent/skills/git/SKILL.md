---
name: git
description: Git workflow with conventional commits, branching strategy, and clean history
---

- Use Conventional Commits: `type(scope): description`
- Summary line under 50 characters — detailed explanation in the body.
- Use feature branches — never commit directly to main/master.
- Run `git status` and `git diff` before every commit.
- For large or complex changes, include in the body:
  - What changed and why (the logic or reasoning)
  - Impact on existing behavior or APIs
  - Migration steps or breaking changes
  - References to issues, tickets, or discussions
- Use `git stash` for temporary work-in-progress, not permanent changes.
- Squash and rebase before merging to keep history clean.
- Tag releases with semantic versioning: `v1.2.3`
- Never commit secrets, build artifacts, or IDE files.
