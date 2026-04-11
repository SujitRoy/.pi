---
name: git-operations
description: Execute git operations including commit, branch management, and repository operations with conventional commits
---

## Git Operations - Direct Execution Guide

When code changes are made, you MUST execute git operations directly. Do NOT just describe what should be done - actually perform the operations.

### Standard Workflow (Execute These Steps)

1. **Check repository status**
   ```bash
   cd /path/to/repo && git status
   ```

2. **Stage all relevant changes**
   ```bash
   git add <files>
   # or for all changes
   git add -A
   ```

3. **Review what will be committed**
   ```bash
   git diff --staged
   ```

4. **Create commit with conventional message**

   For simple changes (1-2 files, obvious change):
   ```bash
   git commit -m "type(scope): brief description"
   ```

   For complex changes (3+ files, non-obvious, needs explanation):
   ```bash
   git commit -m "type(scope): brief summary" -m "What changed:
   - src/auth.js: added JWT token validation middleware
   - src/utils.js: simplified date formatting, removed unused helpers
   
   Why: JWT validation was missing on protected endpoints, date utils had dead code
   
   Impact: All protected routes now require valid JWT. Removed 3 unused utility functions."
   ```

5. **Verify commit succeeded**
   ```bash
   git log -1 --stat
   ```

### Conventional Commit Types

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only changes
- `style:` - Code style changes (formatting, whitespace, etc.)
- `refactor:` - Code refactoring (no feature changes)
- `perf:` - Performance improvements
- `test:` - Adding or updating tests
- `build:` - Build system or external dependency changes
- `ci:` - CI/CD configuration changes
- `chore:` - Other changes that don't modify src

### Common Git Operations to Execute Directly

#### Check Status and Changes
```bash
git status
git diff
git diff --staged
git log -n 5
```

#### Branch Operations
```bash
git branch -a                    # List all branches
git checkout -b feature/name     # Create and switch to new branch
git checkout main                # Switch to main
git merge feature/name           # Merge a branch
git branch -d feature/name       # Delete a branch
```

#### Stash Operations
```bash
git stash                        # Stash current changes
git stash list                   # List stashes
git stash pop                    # Apply and remove stash
git stash apply                  # Apply stash without removing
```

#### Remote Operations
```bash
git remote -v                    # Show remotes
git fetch origin                 # Fetch latest from remote
git pull origin main             # Pull from remote
git push origin feature/name     # Push to remote
```

#### History and Review
```bash
git log --oneline -n 10          # Recent commits
git log --stat -n 5              # Commits with file stats
git show <commit-hash>           # Show specific commit
git blame <file>                 # Show who changed what
```

### Critical Rules

- ALWAYS execute git commands, don't just describe them
- Use conventional commits: `type(scope): description`
- Keep commit messages under 50 characters for summary line
- Stage only the files relevant to the current task
- Never commit secrets, `.env` files, or build artifacts
- Check status before and after operations
- If a git operation fails, read the error and try a different approach
- For merge conflicts, present the options to the user and ask how to resolve

### Commit Message Standards

Use summary-only for simple changes. Use summary + body for complex changes.

**Simple changes** (single-line message):
```
feat(auth): add JWT token validation
fix(api): handle null response in user endpoint
docs(readme): update installation instructions
```

**Complex changes** (multi-line message with body):

When changes involve multiple files, touch several components, or need explanation, use a detailed commit message with a body that explains:

1. **What changed** — list the files/components modified and what was done
2. **Why** — the reasoning or problem being solved
3. **Impact** — any behavioral changes, API changes, or breaking changes
4. **Related** — reference issues, tickets, or related work

Format:
```bash
git commit -m "type(scope): brief summary" -m "What changed:
- File A: description of change
- File B: description of change

Why: reasoning for the change

Impact: any behavioral or API changes"
```

Bad commit messages:
```
update files
fix stuff
changes
wip
```

### When to Use Detailed Commit Messages

Use detailed (multi-line) messages when:
- Changes span 3+ files
- Multiple components or subsystems are affected
- The reasoning is not obvious from the file diff
- There are breaking changes or migration notes
- Security fixes that need documentation
- Performance optimizations that need explanation
- Refactoring that touches many files

Use single-line messages when:
- Only 1-2 files changed
- The change is obvious from the summary
- Simple typo, style, or config fixes

### When to Ask User

- Before force-pushing to a shared branch
- Before resetting or reverting commits
- When encountering merge conflicts (present options)
- Before deleting unmerged branches
- When unsure about which files to stage

### Example Complete Workflow

```bash
# 1. Check what changed
cd /home/sujit/project && git status
git diff

# 2. Stage the changes
git add src/auth.js src/utils.js tests/

# 3. Review staged changes
git diff --staged

# 4. Commit
git commit -m "feat(auth): add JWT token validation"

# 5. Verify
git log -1
git status
```

Remember: EXECUTE these commands, don't just describe them. The user wants results, not explanations of what could be done.
