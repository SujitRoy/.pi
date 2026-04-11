---
name: git-operations
description: Execute git operations including commit, branch management, and repository operations with conventional commits
---

## Git Operations - Direct Execution Guide

When code changes are made, you MUST execute git operations directly. Do NOT just describe what should be done - actually perform the operations.

**Available Git Tools (16 total):**
The Pi agent has specialized git tools for all operations. Use these tools instead of bash commands when available:

| Tool | Parameters | Description |
|------|-----------|-------------|
| `git_status` | `{ cwd }` | Check repository status (staged, unstaged, untracked, unmerged) |
| `git_diff` | `{ cwd, staged, file, stat, nameOnly }` | View changes (staged/unstaged, specific file, stat summary, name-only) |
| `git_add` | `{ files, cwd }` | Stage files for commit (use `["."]` for all, or specific files) |
| `git_commit` | `{ message, cwd }` | Create commit with conventional message (supports multi-line body) |
| `git_branch` | `{ action, name, cwd }` | Actions: `list`, `create`, `switch`, `delete`, `force_delete`, `merge` |
| `git_log` | `{ count, cwd }` | View commit history (default: 10 commits) |
| `git_stash` | `{ action, index, cwd }` | Actions: `save`, `list`, `pop`, `apply`, `drop`, `clear`, `show` |
| `git_push` | `{ remote, branch, force, cwd }` | Push to remote (force uses `--force-with-lease`) |
| `git_pull` | `{ remote, branch, cwd }` | Pull from remote (warns if uncommitted changes present) |
| `git_remote` | `{ action, name, url, cwd }` | Actions: `list`, `add`, `remove`, `set-url` |
| `git_reset` | `{ mode, target, cwd }` | Actions: `soft` (keep staged), `mixed` (keep unstaged), `hard` (discard) |
| `git_tag` | `{ action, name, target, message, remote, cwd }` | Actions: `list`, `create`, `delete`, `push`, `push-all` |
| `git_rebase` | `{ action, target, cwd }` | Actions: `start`, `continue`, `abort`, `skip` |
| `git_cherry_pick` | `{ commit, noCommit, signoff, cwd }` | Cherry pick commits (noCommit stages without committing, signoff adds sign-off) |
| `git_blame` | `{ file, lineNumbers, email, cwd }` | Line-by-line annotation (lineNumbers shows line nums, email shows emails) |
| `git_show` | `{ commit, file, stat, nameOnly, cwd }` | Show commit details (stat shows diffstat, nameOnly shows filenames) |

If a git tool fails, fall back to bash commands: `cd /path && git <command>`

### Standard Workflow (Execute These Steps)

1. **Check repository status**
   - Use `git_status` tool
   - If it fails, use: `cd /path/to/repo && git status`

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
- Use `git_log` tool for commit history
- Use `git_show` for commit details
- Use `git_blame` for line annotation

Fallback bash commands:
```bash
git log --oneline -n 10          # Recent commits
git log --stat -n 5              # Commits with file stats
git show <commit-hash>           # Show specific commit
git blame <file>                 # Show who changed what
```

### Critical Rules

- ALWAYS execute git commands, don't just describe them
- **Use git tools when available, fallback to bash if tools fail**
- Use conventional commits: `type(scope): description`
- Keep commit messages under 50 characters for summary line
- Stage only the files relevant to the current task
- Never commit secrets, `.env` files, or build artifacts
- Check status before and after operations
- If a git operation fails, read the error and try a different approach
- For merge conflicts, present the options to the user and ask how to resolve
- **Test git tools after system updates - report any failures**

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
- **When using `git_commit` tool, provide full message with body for complex changes**

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

**Preferred (using git tools):**
1. Check what changed: `git_status` tool
2. Stage the changes: `git_add` tool with files array
3. Review staged changes: `git_diff` tool with `staged: true`
4. Commit: `git_commit` tool with conventional message
5. Verify: `git_log` tool with `count: 1`

**Fallback (using bash):**
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

### Troubleshooting Git Tool Issues

If git tools fail with errors:
1. First try using bash commands directly
2. Check if repository path is correct
3. Verify git is installed and working: `git --version`
4. Check repository state: `cd /path && git status`
5. Some git operations may fail if repository is in conflicted state

Common tool errors and workarounds:
- `git_status` fails: Use `cd /path && git status`
- `git_commit` fails: Use bash with `git commit -m "message"`
- Tool timeout: Use bash with appropriate timeout

Always verify the operation succeeded by checking status or log afterward.

### Tool Usage Examples

Complete examples showing how to use all 16 git tools:

#### 1. git_status - Check repository status
```
git_status({})
git_status({ cwd: "/path/to/repo" })
```

#### 2. git_diff - View changes
```
git_diff({})                        // View unstaged changes
git_diff({ staged: true })          // View staged changes
git_diff({ file: "src/main.js" })   // View diff for specific file
git_diff({ stat: true })            // View diffstat summary
git_diff({ nameOnly: true })        // View only changed filenames
```

#### 3. git_add - Stage files
```
git_add({ files: ["src/main.js", "src/utils.js"] })  // Stage specific files
git_add({ files: ["."] })                             // Stage all changes
```

#### 4. git_commit - Create commit
```
// Simple commit
git_commit({ message: "feat(auth): add JWT validation" })

// Detailed commit with body for complex changes
git_commit({ message: "feat(auth): add JWT validation

What changed:
- src/auth.js: added middleware
- src/utils.js: updated helpers

Why: Missing validation on protected endpoints

Impact: All protected routes now require JWT" })
```

#### 5. git_branch - Branch operations
```
git_branch({ action: "list" })                                    // List all branches
git_branch({ action: "create", name: "feature/new-feature" })     // Create and switch
git_branch({ action: "switch", name: "main" })                    // Switch branch
git_branch({ action: "delete", name: "feature/old" })             // Delete (safe)
git_branch({ action: "force_delete", name: "feature/abandoned" }) // Force delete
git_branch({ action: "merge", name: "feature/new-feature" })      // Merge into current
```

#### 6. git_log - View history
```
git_log({})              // Last 10 commits
git_log({ count: 5 })    // Last 5 commits
git_log({ count: 20 })   // Last 20 commits
```

#### 7. git_stash - Stash operations
```
git_stash({ action: "save" })                  // Save current changes
git_stash({ action: "list" })                  // List all stashes
git_stash({ action: "pop" })                   // Apply latest stash
git_stash({ action: "pop", index: 2 })         // Apply stash@{2}
git_stash({ action: "apply", index: 0 })       // Apply without removing
git_stash({ action: "show", index: 1 })        // View stash diff
git_stash({ action: "drop", index: 0 })        // Remove stash@{0}
git_stash({ action: "clear" })                 // Remove all stashes
```

#### 8. git_push - Push to remote
```
git_push({})                        // Push current branch to origin
git_push({ branch: "main" })        // Push main branch
git_push({ remote: "upstream" })    // Push to upstream
git_push({ force: true })           // Force push with lease
```

#### 9. git_pull - Pull from remote
```
git_pull({})                        // Pull current branch from origin
git_pull({ branch: "main" })        // Pull main branch
git_pull({ remote: "upstream" })    // Pull from upstream
```

#### 10. git_remote - Remote management
```
git_remote({ action: "list" })                                  // List remotes
git_remote({ action: "add", name: "upstream", url: "https://..." })  // Add remote
git_remote({ action: "remove", name: "old-remote" })            // Remove remote
git_remote({ action: "set-url", name: "origin", url: "https://..." }) // Update URL
```

#### 11. git_reset - Reset operations
```
git_reset({})                              // Soft reset to HEAD (default)
git_reset({ mode: "soft" })                // Keep changes staged
git_reset({ mode: "mixed" })               // Keep changes unstaged
git_reset({ mode: "hard" })                // Discard all changes
git_reset({ mode: "soft", target: "HEAD~2" }) // Reset to 2 commits ago
```

#### 12. git_tag - Tag management
```
git_tag({ action: "list" })                                    // List all tags
git_tag({ action: "create", name: "v1.0.0" })                  // Lightweight tag
git_tag({ action: "create", name: "v1.0.0", message: "Release" }) // Annotated tag
git_tag({ action: "create", name: "v1.0.0", target: "abc1234" })   // Tag specific commit
git_tag({ action: "delete", name: "v0.9.0" })                  // Delete tag
git_tag({ action: "push", name: "v1.0.0" })                    // Push single tag
git_tag({ action: "push-all" })                                // Push all tags
```

#### 13. git_rebase - Rebase operations
```
git_rebase({ action: "start", target: "main" })    // Start rebase onto main
git_rebase({ action: "continue" })                  // Continue after conflicts
git_rebase({ action: "abort" })                     // Cancel rebase
git_rebase({ action: "skip" })                      // Skip current commit
```

#### 14. git_cherry_pick - Cherry pick commits
```
git_cherry_pick({ commit: "abc1234" })              // Cherry pick commit
git_cherry_pick({ commit: "abc1234", signoff: true })  // With sign-off
git_cherry_pick({ commit: "abc1234", noCommit: true }) // Stage without committing
```

#### 15. git_blame - Line annotations
```
git_blame({ file: "src/main.js" })                  // Blame file
git_blame({ file: "src/main.js", lineNumbers: true }) // With line numbers
git_blame({ file: "src/main.js", email: true })     // Show emails
```

#### 16. git_show - Commit details
```
git_show({ commit: "HEAD" })                        // Show latest commit
git_show({ commit: "abc1234" })                     // Show specific commit
git_show({ commit: "abc1234", stat: true })         // Show with diffstat
git_show({ commit: "abc1234", nameOnly: true })     // Show filenames only
git_show({ commit: "abc1234", file: "src/main.js" }) // Show specific file
```
