---
name: git
description: Git workflow with conventional commits, branching strategy, and clean history
---

- Use Conventional Commits: `type(scope): description`
- Summary line under 50 characters — detailed explanation in the body.
- Use feature branches — never commit directly to main/master.
- Run `git_status` and `git_diff` before every commit.
- For large or complex changes, include in the body:
  - What changed and why (the logic or reasoning)
  - Impact on existing behavior or APIs
  - Migration steps or breaking changes
  - References to issues, tickets, or discussions
- Use `git_stash` with `action: "save"` for temporary work-in-progress, not permanent changes.
- Squash and rebase before merging to keep history clean. Use `git_rebase` tool for rebase operations.
- Tag releases with semantic versioning: `v1.2.3`. Use `git_tag` tool for tag management.
- Never commit secrets, build artifacts, or IDE files.
- Consider commit signing for important repositories
- Use git hooks for pre-commit checks (linting, formatting)
- For complex histories, prefer interactive rebase over merge commits
- When cherry-picking, verify the change applies cleanly in new context. Use `git_cherry_pick` tool.
- Use `git_reset({ mode: "soft" })` to amend commits without losing changes
- Use `git_reset({ mode: "mixed" })` to unstage changes while keeping modifications
- Use `git_reset({ mode: "hard" })` with extreme caution — discards all changes
- Keep `.gitignore` comprehensive for your language/framework
- Use `git_blame` to understand code history before making changes
- Use `git_show` to review commit details when investigating changes
- For detailed tool usage and examples, see the git-operations skill
