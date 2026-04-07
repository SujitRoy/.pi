---
name: git
description: Git workflow best practices including conventional commits, branching strategy, and history cleanup
---

When working with Git:

- Use Conventional Commits format: `type(scope): description`
  - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`
  - Example: `feat(auth): add JWT token validation middleware`
- Keep commit messages under 50 characters for summary
- Add detailed body after blank line if needed
- Always run `git status` before operations
- Use feature branches, never commit directly to main/master
- Suggest `git diff` before committing to review changes
- Use `git stash` for temporary work-in-progress
- Recommend interactive rebase (`git rebase -i`) for cleanup before push
- Use `.gitignore` properly (no secrets, build artifacts, IDE files)
- Tag releases with semantic versioning (`v1.2.3`)
- Squash commits for clean history on merge
