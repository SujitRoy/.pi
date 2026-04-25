/**
 * PI Agent Extension: Git Tools (Enhanced & Secured)
 *
 * Provides direct git operations as callable tools for the PI agent.
 * Enables committing, branching, staging, and other git operations without
 * requiring manual shell commands.
 *
 * Tools Provided (16 total):
 * - git_status({ cwd }) - Check repository status
 * - git_diff({ cwd, staged, file, stat, nameOnly }) - View changes
 * - git_add({ files, cwd }) - Stage files
 * - git_commit({ message, cwd }) - Create commit
 * - git_branch({ action, name, cwd }) - Branch operations
 * - git_log({ count, cwd }) - View commit history
 * - git_stash({ action, index, cwd }) - Stash operations
 * - git_push({ remote, branch, force, cwd }) - Push to remote
 * - git_pull({ remote, branch, cwd }) - Pull from remote
 * - git_remote({ action, name, url, cwd }) - Remote management
 * - git_reset({ mode, target, cwd }) - Reset operations
 * - git_tag({ action, name, target, message, remote, cwd }) - Tag management
 * - git_rebase({ action, target, cwd }) - Rebase operations
 * - git_cherry_pick({ commit, noCommit, signoff, cwd }) - Cherry pick commits
 * - git_blame({ file, lineNumbers, email, cwd }) - Line-by-line annotations
 * - git_show({ commit, file, stat, nameOnly, cwd }) - View commit details
 *
 * Security Features:
 * - Command injection prevention via path validation
 * - Secure temp file creation with mkdtemp
 * - Working directory validation
 * - Parameter range checking
 * - AbortSignal cancellation support
 *
 * Configuration:
 * - Works in any git repository
 * - cwd parameter specifies working directory (defaults to current)
 */

import { execFile, ExecFileException } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { StringEnum } from '@mariozechner/pi-ai';

const execFileAsync = promisify(execFile);

// ============================================================================
// Type Definitions
// ============================================================================

interface GitCommandOptions {
  timeout?: number;
  maxBuffer?: number;
  signal?: AbortSignal | null;
}

interface GitCommandResult {
  success: boolean;
  error?: string;
  stdout: string;
  stderr: string;
  exitCode?: number;
  signal?: string;
  killed?: boolean;
}

interface StatusFile {
  file: string;
  status: string;
}

interface StatusResult {
  success: boolean;
  error?: string;
  branch: string;
  upstream: string | null;
  staged: StatusFile[];
  unstaged: StatusFile[];
  untracked: string[];
  unmerged: Array<{ file: string; indexStatus: string; worktreeStatus: string }>;
  clean: boolean;
}

interface DiffOptions {
  staged?: boolean;
  file?: string | null;
  stat?: boolean;
  nameOnly?: boolean;
}

interface DiffResult {
  success: boolean;
  error?: string;
  diff: string;
  hasChanges: boolean;
}

interface AddResult {
  success: boolean;
  error?: string | null;
  staged: string[];
}

interface CommitResult {
  success: boolean;
  error?: string | null;
  hash?: string | null;
  branch?: string | null;
  message?: string;
  summary?: string;
  isDetailed?: boolean;
  stdout?: string;
}

interface Branch {
  name: string;
  current: boolean;
  remote: boolean;
}

interface BranchResult {
  success: boolean;
  error?: string;
  hint?: string;
  branches?: Branch[];
  branch?: string;
  message?: string | null;
  summary?: string;
}

interface CommitInfo {
  hash: string;
  refs: string | null;
  message: string;
}

interface LogResult {
  success: boolean;
  error?: string;
  commits: CommitInfo[];
  count: number;
}

interface StashResult {
  success: boolean;
  error?: string;
  summary?: string;
  stashes?: string[];
  count?: number;
  diff?: string;
}

interface PushResult {
  success: boolean;
  error?: string | null;
  remote: string;
  branch?: string | null;
  summary: string;
}

interface PullResult {
  success: boolean;
  error?: string | null;
  remote: string;
  branch?: string | null;
  summary: string;
}

interface RemoteInfo {
  [key: string]: {
    fetch?: string;
    push?: string;
  };
}

interface RemoteResult {
  success: boolean;
  error?: string;
  remotes?: RemoteInfo;
  remote?: string;
  url?: string;
}

interface ResetResult {
  success: boolean;
  error?: string;
  mode: string;
  target: string;
  summary?: string;
}

interface TagResult {
  success: boolean;
  error?: string;
  tags?: string[];
  count?: number;
  tag?: string;
  target?: string;
  remote?: string;
}

interface RebaseResult {
  success: boolean;
  error?: string;
  target?: string;
  summary?: string;
}

interface CherryPickResult {
  success: boolean;
  error?: string;
  commit: string;
  summary?: string;
}

interface BlameResult {
  success: boolean;
  error?: string;
  file: string;
  blame: string;
}

interface ShowResult {
  success: boolean;
  error?: string;
  commit: string;
  output: string;
}

interface TagOptions {
  message?: string;
  remote?: string;
}

interface CherryPickOptions {
  noCommit?: boolean;
  signoff?: boolean;
}

interface BlameOptions {
  lineNumbers?: boolean;
  email?: boolean;
}

interface ShowOptions {
  file?: string;
  stat?: boolean;
  nameOnly?: boolean;
}

interface PrResult {
  success: boolean;
  error?: string;
  prUrl?: string;
  prNumber?: number;
  remote?: string;
  head?: string;
  base?: string;
  summary: string;
}

interface PrOptions {
  draft?: boolean;
  reviewer?: string;
  assignee?: string;
  label?: string;
  project?: string;
  milestone?: string;
  deleteBranch?: boolean;
  autoPush?: boolean;
}



// Extend execFileAsync result type
interface ExecFileResult {
  stdout: string;
  stderr: string;
}

// ============================================================================
// Security Utilities
// ============================================================================

/**
 * Validate and sanitize file path to prevent command injection
 */
function validateFilePath(filePath: string, baseDir: string): string {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error(`Invalid file path: ${filePath}`);
  }

  // Prevent command injection by rejecting suspicious patterns
  const dangerousPatterns = [
    /^--/,              // Git options
    /[`$(){}|;&]/,      // Shell metacharacters
    /[\n\r]/,           // Newlines
    /^\//,              // Absolute paths (use relative only)
    /\.\./,             // Path traversal
    /^\\\\/,            // Windows UNC paths
    /["']/,             // Quotes
    /[\x00-\x1f]/,      // Control characters
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(filePath)) {
      throw new Error(`Invalid file path: contains dangerous characters`);
    }
  }

  // Resolve to absolute path and verify it's within baseDir
  const resolvedPath = path.resolve(baseDir, filePath);
  const normalizedBase = path.resolve(baseDir);

  if (!resolvedPath.startsWith(normalizedBase)) {
    throw new Error(`Invalid file path: outside working directory`);
  }

  return resolvedPath;
}

/**
 * Validate working directory
 */
function validateCwd(cwd?: string): string {
  const workingDir = cwd || process.cwd();

  // Check if path exists
  if (!fs.existsSync(workingDir)) {
    throw new Error(`Working directory does not exist: ${workingDir}`);
  }

  // Check if it's a directory
  const stat = fs.statSync(workingDir);
  if (!stat.isDirectory()) {
    throw new Error(`Working directory is not a directory: ${workingDir}`);
  }

  return workingDir;
}

/**
 * Validate that directory is a git repository
 */
async function validateGitRepo(workingDir: string): Promise<boolean> {
  // Check manually for .git directory to avoid git command output
  // (fs and path are already imported at top level)
  
  function checkGitDir(dir: string): boolean {
    const gitDir = path.join(dir, '.git');
    try {
      const stat = fs.statSync(gitDir);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }
  
  // Check current directory and parent directories
  let currentDir = workingDir;
  while (currentDir && currentDir !== '/') {
    if (checkGitDir(currentDir)) {
      return true;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break; // reached root
    currentDir = parentDir;
  }
  
  // Not a git repository
  throw new Error(`Not a git repository: ${workingDir}`);
}

/**
 * Validate numeric parameter
 */
function validateNumber(value: number, name: string, min: number = 1, max: number = 1000): number {
  const num = Number(value);
  if (!Number.isInteger(num) || num < min || num > max) {
    throw new Error(`Invalid ${name}: must be integer between ${min} and ${max}`);
  }
  return num;
}

// ============================================================================
// Git Command Executor
// ============================================================================

/**
 * Cache of verified git repository directories
 */
const gitReposChecked = new Set<string>();

/**
 * Execute a git command with error handling and cancellation support
 */
async function executeGitCommand(
  cwd: string,
  args: string[],
  options: GitCommandOptions = {}
): Promise<GitCommandResult> {
  const {
    timeout = 30000,
    maxBuffer = 10 * 1024 * 1024, // 10MB
    signal = null
  } = options;

  const workingDir = validateCwd(cwd);

  // Validate it's a git repository (check once, cache result)
  if (!gitReposChecked.has(workingDir)) {
    try {
      await validateGitRepo(workingDir);
      gitReposChecked.add(workingDir);
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: err.message,
        stdout: '',
        stderr: ''
      };
    }
  }

  // Check if already aborted
  if (signal && signal.aborted) {
    return {
      success: false,
      error: 'Operation was cancelled',
      stdout: '',
      stderr: ''
    };
  }

  try {
    const result = await new Promise<ExecFileResult>((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const childProcess = execFile('git', args, {
        cwd: workingDir,
        timeout,
        maxBuffer,
        encoding: 'utf8',
        env: { ...process.env }
      }, (error: ExecFileException | null, stdout: string, stderr: string) => {
        if (error) {
          const err = new Error(error.message) as ExecFileException & { exitCode?: string | number | null; stdout?: string; stderr?: string };
          err.exitCode = error.code;
          err.stdout = stdout || '';
          err.stderr = stderr || '';
          reject(err);
        } else {
          resolve({ stdout: stdout || '', stderr: stderr || '' });
        }
      });

      // Attach signal to child process
      if (signal) {
        signal.addEventListener('abort', () => {
          childProcess.kill('SIGTERM');
        }, { once: true });
      }
    });

    return {
      success: true,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim()
    };
  } catch (error) {
    const err = error as ExecFileException & { exitCode?: string | number | null; stdout?: string; stderr?: string };
    // Preserve useful error information without leaking internal stack traces
    return {
      success: false,
      error: err.message,
      stdout: err.stdout?.trim() || '',
      stderr: err.stderr?.trim() || '',
      exitCode: (err.exitCode || err.code) ? Number(err.exitCode || err.code) : undefined,
      signal: err.signal,
      killed: err.killed
    };
  }
};

// ============================================================================
// Git Operations
// ============================================================================

/**
 * Get git status
 */
async function gitStatus(cwd?: string): Promise<StatusResult> {
  const workingDir = validateCwd(cwd);
  const result = await executeGitCommand(workingDir, ['status', '--short', '--branch']);

  if (!result.success) {
    return { success: false, error: result.error, branch: '', upstream: null, staged: [], unstaged: [], untracked: [], unmerged: [], clean: false };
  }

  // Parse status output with comprehensive status code handling
  const lines = result.stdout.split('\n').filter(line => line.trim());
  const branchLine = lines[0] || '';
  const branchMatch = branchLine.match(/## (.+?)(?:\.\.\.(.+))?$/);

  // Status code mapping
  const statusMap: Record<string, string> = {
    'M': 'modified',
    'A': 'added',
    'D': 'deleted',
    'R': 'renamed',
    'C': 'copied',
    'U': 'unmerged',
    'T': 'type_changed',
    '!': 'ignored',
    ' ': 'unmodified',
    '?': 'untracked'
  };

  const status: StatusResult = {
    success: true,
    branch: branchMatch ? branchMatch[1] : 'unknown',
    upstream: branchMatch ? branchMatch[2] : null,
    staged: [],
    unstaged: [],
    untracked: [],
    unmerged: [],
    clean: result.stdout.trim() === '' || (lines.length === 1 && lines[0].startsWith('##'))
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.length < 4) continue;

    const indexStatus = line[0];
    const worktreeStatus = line[1];
    const filePath = line.substring(3).trim();

    // Handle untracked files
    if (indexStatus === '?' && worktreeStatus === '?') {
      status.untracked.push(filePath);
      continue;
    }

    // Handle unmerged files
    if (indexStatus === 'U' || worktreeStatus === 'U') {
      status.unmerged.push({ 
        file: filePath, 
        indexStatus: statusMap[indexStatus] || indexStatus, 
        worktreeStatus: statusMap[worktreeStatus] || worktreeStatus 
      });
      continue;
    }

    // Handle staged changes (index column)
    if (indexStatus !== ' ' && indexStatus !== '?') {
      status.staged.push({
        file: filePath,
        status: statusMap[indexStatus] || indexStatus
      });
    }

    // Handle unstaged changes (worktree column)
    if (worktreeStatus !== ' ' && worktreeStatus !== '?') {
      status.unstaged.push({
        file: filePath,
        status: statusMap[worktreeStatus] || worktreeStatus
      });
    }
  }

  return status;
}

/**
 * Get git diff
 */
async function gitDiff(cwd?: string, options: DiffOptions = {}): Promise<DiffResult> {
  const workingDir = validateCwd(cwd);
  const {
    staged = false,
    file = null,
    stat = false,
    nameOnly = false
  } = options;

  const args: string[] = ['diff', '--no-color'];

  if (stat) {
    args.push('--stat');
  } else if (nameOnly) {
    args.push('--name-only');
  }

  if (staged) {
    args.push('--cached');
  }

  if (file) {
    const validatedFile = validateFilePath(file, workingDir);
    args.push('--', validatedFile);
  }

  const result = await executeGitCommand(workingDir, args);

  if (!result.success) {
    return { success: false, error: result.error, diff: '', hasChanges: false };
  }

  return {
    success: true,
    diff: result.stdout,
    hasChanges: result.stdout.trim() !== ''
  };
}

/**
 * Stage files
 */
async function gitAdd(files: string[], cwd?: string): Promise<AddResult> {
  if (!files || files.length === 0) {
    return { success: false, error: 'No files specified', staged: [] };
  }

  const workingDir = validateCwd(cwd);

  // Validate all file paths
  const validatedFiles: string[] = [];
  for (const file of files) {
    try {
      validatedFiles.push(validateFilePath(file, workingDir));
    } catch (error) {
      const err = error as Error;
      return { success: false, error: `Invalid file "${file}": ${err.message}`, staged: [] };
    }
  }

  const args = ['add', ...validatedFiles];
  const result = await executeGitCommand(workingDir, args);

  return {
    success: result.success,
    error: result.success ? undefined : result.error,
    staged: result.success ? validatedFiles : []
  };
}

/**
 * Create a commit
 */
async function gitCommit(message: string, cwd?: string): Promise<CommitResult> {
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return { success: false, error: 'Commit message is required' };
  }

  const workingDir = validateCwd(cwd);

  // Check if there's anything staged
  // 'git diff --cached --quiet' exits 0 if NO staged changes (clean), 1 if THERE ARE staged changes
  const statusResult = await executeGitCommand(workingDir, ['diff', '--cached', '--quiet']);
  // exitCode 1 means diff found (staged changes exist) -> proceed with commit
  // exitCode 0 (success) means no diff -> nothing staged, reject
  if (statusResult.success) {
    return {
      success: false,
      error: 'No staged changes to commit. Use git_add first.'
    };
  }
  // Also reject if exit code > 1 (actual error, not just "no changes")
  if (statusResult.exitCode !== 1) {
    return {
      success: false,
      error: statusResult.error || 'Failed to check staged changes'
    };
  }

  // Use secure temp file creation
  let tmpFile: string | undefined;
  try {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'git-commit-'));
    tmpFile = path.join(tmpDir, 'message.txt');
    await fs.promises.writeFile(tmpFile, message, 'utf8');
  } catch (error) {
    const err = error as Error;
    return {
      success: false,
      error: `Failed to create temp file: ${err.message}`
    };
  }

  try {
    if (!tmpFile) {
      return {
        success: false,
        error: 'Failed to create temp file: path is undefined'
      };
    }
    const args = ['commit', '-F', tmpFile];
    const result = await executeGitCommand(workingDir, args);

    if (!result.success) {
      return {
        success: false,
        error: result.stderr || result.error,
        stdout: result.stdout
      };
    }

    // Parse commit output
    const lines = result.stdout.split('\n');
    const commitLine = lines.find(line => line.match(/^\[.+ [a-f0-9]{7}\]/));
    const commitMatch = commitLine?.match(/\[([^\s]+) ([a-f0-9]{7})\] (.+)$/);
    const summary = message.split('\n')[0].trim();

    return {
      success: true,
      hash: commitMatch ? commitMatch[2] : null,
      branch: commitMatch ? commitMatch[1] : null,
      message: commitMatch ? commitMatch[3] : summary,
      summary: result.stdout,
      isDetailed: message.includes('\n')
    };
  } finally {
    // Clean up temp file and directory
    if (tmpFile) {
      try {
        await fs.promises.unlink(tmpFile);
      } catch (error) {
        const err = error as Error;
        console.error(`[git-tools] Failed to remove temp file ${tmpFile}: ${err.message}`);
      }
      // Clean up temp directory (use recursive removal for safety)
      const tmpDir = path.dirname(tmpFile);
      try {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
      } catch (error) {
        const err = error as Error;
        console.error(`[git-tools] Failed to remove temp directory ${tmpDir}: ${err.message}`);
      }
    }
  }
}

/**
 * Branch operations
 */
async function gitBranch(action: string, name?: string, cwd?: string): Promise<BranchResult> {
  const workingDir = validateCwd(cwd);

  // Validate branch name if provided
  if (name) {
    if (typeof name !== 'string' || name.startsWith('-')) {
      return { success: false, error: 'Invalid branch name: must not start with -' };
    }
    // Git branch name rules: no spaces, ~^:?*[\, no @{}, no consecutive dots, not empty
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._/\-]+$/.test(name)) {
      return { success: false, error: 'Invalid branch name: contains forbidden characters' };
    }
    if (name.includes('..') || name.endsWith('.lock')) {
      return { success: false, error: 'Invalid branch name: contains forbidden patterns' };
    }
  }

  switch (action) {
    case 'list': {
      const result = await executeGitCommand(workingDir, ['branch', '-a']);
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const branches: Branch[] = result.stdout.split('\n')
        .map(line => line.trim())
        .filter(line => line)
        .map(line => ({
          name: line.replace(/^[\*\s]+/, ''),
          current: line.startsWith('*'),
          remote: line.includes('remotes/')
        }));

      return { success: true, branches };
    }

    case 'create': {
      if (!name) {
        return { success: false, error: 'Branch name is required' };
      }

      // Check if branch already exists
      const checkResult = await executeGitCommand(workingDir, ['branch', '--list', name]);
      if (checkResult.success && checkResult.stdout.trim()) {
        return { success: false, error: `Branch '${name}' already exists` };
      }

      // Create branch only without switching (use 'git branch', not 'checkout -b')
      const result = await executeGitCommand(workingDir, ['branch', name]);
      return {
        success: result.success,
        error: result.success ? undefined : result.stderr || result.error,
        branch: name,
        message: result.success ? `Branch '${name}' created` : null
      };
    }

    case 'switch': {
      if (!name) {
        return { success: false, error: 'Branch name is required' };
      }
      const result = await executeGitCommand(workingDir, ['checkout', name]);
      return {
        success: result.success,
        error: result.success ? undefined : result.stderr || result.error,
        branch: name
      };
    }

    case 'delete': {
      if (!name) {
        return { success: false, error: 'Branch name is required' };
      }

      // Try safe delete first, check stderr for errors
      const result = await executeGitCommand(workingDir, ['branch', '-d', name]);

      // Git -d exits with code 1 if branch is not fully merged
      if (!result.success) {
        return {
          success: false,
          error: result.stderr || result.error,
          hint: 'Use force_delete action to delete unmerged branches'
        };
      }

      // Check if stderr has warnings
      if (result.stderr && result.stderr.includes('not fully merged')) {
        return {
          success: false,
          error: `Branch '${name}' is not fully merged`,
          hint: 'Use force_delete action to delete unmerged branches'
        };
      }

      return {
        success: true,
        branch: name
      };
    }

    case 'force_delete': {
      if (!name) {
        return { success: false, error: 'Branch name is required' };
      }
      const result = await executeGitCommand(workingDir, ['branch', '-D', name]);
      return {
        success: result.success,
        error: result.success ? undefined : result.stderr || result.error,
        branch: name
      };
    }

    case 'merge': {
      if (!name) {
        return { success: false, error: 'Branch name is required' };
      }
      const result = await executeGitCommand(workingDir, ['merge', name]);
      return {
        success: result.success,
        error: result.success ? undefined : result.stderr || result.error,
        branch: name,
        summary: result.stdout
      };
    }

    default:
      return { success: false, error: `Unknown action: ${action}. Supported: list, create, switch, delete, force_delete, merge` };
  }
}

/**
 * View commit log
 */
async function gitLog(count: number = 10, cwd?: string): Promise<LogResult> {
  const workingDir = validateCwd(cwd);
  const validatedCount = validateNumber(count, 'count', 1, 1000);

  const args = ['log', `-${validatedCount}`, '--oneline', '--decorate'];
  const result = await executeGitCommand(workingDir, args);

  if (!result.success) {
    return { success: false, error: result.error, commits: [], count: 0 };
  }

  const commits: CommitInfo[] = result.stdout.split('\n')
    .filter(line => line.trim())
    .map(line => {
      // Improved regex for parsing git log with --decorate
      // Format: hash (refs) message or hash message
      const match = line.match(/^([a-f0-9]+)\s+(?:\((.+?)\)\s+)?(.+)$/);
      if (match) {
        return {
          hash: match[1],
          refs: match[2] || null,
          message: match[3]
        };
      }
      return {
        hash: line.substring(0, 7),
        refs: null,
        message: line.substring(8)
      };
    });

  return {
    success: true,
    commits,
    count: commits.length
  };
}

/**
 * Stash operations
 */
async function gitStash(action: string, cwd?: string, index: number | null = null): Promise<StashResult> {
  const workingDir = validateCwd(cwd);

  // Validate stash index if provided
  if (index !== null) {
    if (typeof index !== 'number' || index < 0 || !Number.isInteger(index)) {
      return { success: false, error: `Invalid stash index: ${index}. Must be a non-negative integer.` };
    }
  }

  switch (action) {
    case 'save': {
      const result = await executeGitCommand(workingDir, ['stash', 'push']);
      return {
        success: result.success,
        error: result.success ? undefined : result.stderr || result.error,
        summary: result.stdout
      };
    }

    case 'list': {
      const result = await executeGitCommand(workingDir, ['stash', 'list']);
      if (!result.success) {
        return { success: false, error: result.error };
      }
      const stashes = result.stdout.split('\n').filter(line => line.trim());
      return { success: true, stashes, count: stashes.length };
    }

    case 'pop': {
      const args = ['stash', 'pop'];
      if (index !== null) {
        args.push(`stash@{${index}}`);
      }
      const result = await executeGitCommand(workingDir, args);
      return {
        success: result.success,
        error: result.success ? undefined : result.stderr || result.error,
        summary: result.stdout
      };
    }

    case 'apply': {
      const args = ['stash', 'apply'];
      if (index !== null) {
        args.push(`stash@{${index}}`);
      }
      const result = await executeGitCommand(workingDir, args);
      return {
        success: result.success,
        error: result.success ? undefined : result.stderr || result.error,
        summary: result.stdout
      };
    }

    case 'drop': {
      const args = ['stash', 'drop'];
      if (index !== null) {
        args.push(`stash@{${index}}`);
      }
      const result = await executeGitCommand(workingDir, args);
      return {
        success: result.success,
        error: result.success ? undefined : result.stderr || result.error,
        summary: result.stdout
      };
    }

    case 'clear': {
      const result = await executeGitCommand(workingDir, ['stash', 'clear']);
      return {
        success: result.success,
        error: result.success ? undefined : result.stderr || result.error
      };
    }

    case 'show': {
      const args = ['stash', 'show', '-p'];
      if (index !== null) {
        args.push(`stash@{${index}}`);
      }
      const result = await executeGitCommand(workingDir, args);
      return {
        success: result.success,
        error: result.success ? undefined : result.stderr || result.error,
        diff: result.stdout
      };
    }

    default:
      return { success: false, error: `Unknown action: ${action}. Supported: save, list, pop, apply, drop, clear, show` };
  }
}

/**
 * Push to remote
 */
async function gitPush(remote: string = 'origin', branch: string | null = null, cwd?: string, force: boolean = false): Promise<PushResult> {
  const workingDir = validateCwd(cwd);

  // Pre-flight: check if there are commits to push
  const statusResult = await executeGitCommand(workingDir, ['status', '--short', '--branch']);
  if (!statusResult.success) {
    return { success: false, error: 'Failed to check repository status', remote, summary: '' };
  }

  const args: string[] = ['push'];
  if (force) {
    args.push('--force-with-lease');
  }
  args.push(remote);
  if (branch) {
    args.push(branch);
  }

  const result = await executeGitCommand(workingDir, args);

  const summary = result.stdout || result.stderr || '';
  const forceWarning = force
    ? '\n\n**WARNING: Force push executed (--force-with-lease)**\nThis can overwrite remote history. Verify the remote branch is in the expected state.'
    : '';

  return {
    success: result.success,
    error: result.success ? undefined : result.stderr || result.error,
    remote,
    branch,
    summary: summary + forceWarning
  };
}

/**
 * Pull from remote
 */
async function gitPull(remote: string = 'origin', branch: string | null = null, cwd?: string): Promise<PullResult> {
  const workingDir = validateCwd(cwd);

  // Pre-flight: check for uncommitted changes
  await executeGitCommand(workingDir, ['status', '--porcelain']);

  const args: string[] = ['pull'];
  if (remote) {
    args.push(remote);
  }
  if (branch) {
    args.push(branch);
  }

  const result = await executeGitCommand(workingDir, args);

  return {
    success: result.success,
    error: result.success ? undefined : result.stderr || result.error,
    remote,
    branch,
    summary: result.stdout || result.stderr
  };
}

/**
 * Remote management
 */
async function gitRemote(action: string, name?: string, url?: string, cwd?: string): Promise<RemoteResult> {
  const workingDir = validateCwd(cwd);

  // Validate remote name if provided
  if (name) {
    if (typeof name !== 'string' || name.startsWith('-')) {
      return { success: false, error: 'Invalid remote name: must not start with -' };
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-]*$/.test(name)) {
      return { success: false, error: 'Invalid remote name: contains forbidden characters' };
    }
  }

  // Validate URL if provided
  if (url) {
    if (typeof url !== 'string' || url.startsWith('-')) {
      return { success: false, error: 'Invalid remote URL: must not start with -' };
    }
  }

  switch (action) {
    case 'list': {
      const result = await executeGitCommand(workingDir, ['remote', '-v']);
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const remotes: RemoteInfo = {};
      const lines = result.stdout.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const remoteName = parts[0];
          const remoteUrl = parts[1];
          const type = parts[2] ? parts[2].replace(/[()]/g, '') : 'unknown';

          if (!remotes[remoteName]) {
            remotes[remoteName] = {};
          }
          remotes[remoteName][type as 'fetch' | 'push'] = remoteUrl;
        }
      }

      return { success: true, remotes };
    }

    case 'add': {
      if (!name || !url) {
        return { success: false, error: 'Remote name and URL are required' };
      }
      const result = await executeGitCommand(workingDir, ['remote', 'add', name, url]);
      return {
        success: result.success,
        error: result.success ? undefined : result.stderr || result.error,
        remote: name,
        url
      };
    }

    case 'remove': {
      if (!name) {
        return { success: false, error: 'Remote name is required' };
      }
      const result = await executeGitCommand(workingDir, ['remote', 'remove', name]);
      return {
        success: result.success,
        error: result.success ? undefined : result.stderr || result.error,
        remote: name
      };
    }

    case 'set-url': {
      if (!name || !url) {
        return { success: false, error: 'Remote name and URL are required' };
      }
      const result = await executeGitCommand(workingDir, ['remote', 'set-url', name, url]);
      return {
        success: result.success,
        error: result.success ? undefined : result.stderr || result.error,
        remote: name,
        url
      };
    }

    default:
      return { success: false, error: `Unknown action: ${action}. Supported: list, add, remove, set-url` };
  }
}

/**
 * Reset operations
 */
async function gitReset(mode: string, target: string = 'HEAD', cwd?: string): Promise<ResetResult> {
  const workingDir = validateCwd(cwd);

  // Validate mode
  const validModes = ['soft', 'mixed', 'hard'];
  if (!validModes.includes(mode)) {
    return {
      success: false,
      error: `Invalid reset mode: ${mode}. Must be one of: ${validModes.join(', ')}`,
      mode,
      target: target || 'HEAD'
    };
  }

  // Validate target to prevent git option injection
  if (target) {
    if (typeof target !== 'string' || target.startsWith('-')) {
      return {
        success: false,
        error: 'Invalid target: must be a valid commit reference, not starting with -',
        mode,
        target: target || 'HEAD'
      };
    }
    // Validate as commit-ish (alphanumeric, dots, slashes, hyphens)
    if (!/^[a-zA-Z0-9._/\-]+$/.test(target)) {
      return {
        success: false,
        error: 'Invalid target: contains forbidden characters',
        mode,
        target: target || 'HEAD'
      };
    }
  }

  const args: string[] = ['reset'];

  if (mode === 'soft') {
    args.push('--soft');
  } else if (mode === 'hard') {
    args.push('--hard');
  }
  // mixed is default, no flag needed

  if (target) {
    args.push(target);
  }

  const result = await executeGitCommand(workingDir, args);

  return {
    success: result.success,
    error: result.success ? undefined : result.stderr || result.error,
    mode,
    target: target || 'HEAD',
    summary: result.stdout
  };
}

/**
 * Tag management
 */
async function gitTag(action: string, name?: string, target?: string, cwd?: string, options: TagOptions = {}): Promise<TagResult> {
  const workingDir = validateCwd(cwd);

  // Validate tag name if provided
  if (name) {
    if (typeof name !== 'string' || name.startsWith('-')) {
      return { success: false, error: 'Invalid tag name: must not start with -' };
    }
    // Git tag name rules: no spaces, ~^:?*[\, no @{}, no consecutive dots
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._/\-]*$/.test(name)) {
      return { success: false, error: 'Invalid tag name: contains forbidden characters' };
    }
  }

  switch (action) {
    case 'list': {
      const result = await executeGitCommand(workingDir, ['tag', '-l']);
      if (!result.success) {
        return { success: false, error: result.error };
      }
      const tags = result.stdout.split('\n').filter(line => line.trim());
      return { success: true, tags, count: tags.length };
    }

    case 'create': {
      if (!name) {
        return { success: false, error: 'Tag name is required' };
      }

      const args: string[] = ['tag'];

      if (options.message) {
        args.push('-a', name, '-m', options.message);
      } else {
        args.push(name);
      }

      if (target) {
        args.push(target);
      }

      const result = await executeGitCommand(workingDir, args);
      return {
        success: result.success,
        error: result.success ? undefined : result.stderr || result.error,
        tag: name,
        target: target || 'HEAD'
      };
    }

    case 'delete': {
      if (!name) {
        return { success: false, error: 'Tag name is required' };
      }
      const result = await executeGitCommand(workingDir, ['tag', '-d', name]);
      return {
        success: result.success,
        error: result.success ? undefined : result.stderr || result.error,
        tag: name
      };
    }

    case 'push': {
      if (!name) {
        return { success: false, error: 'Tag name is required' };
      }
      const remote = options.remote || 'origin';
      const result = await executeGitCommand(workingDir, ['push', remote, name]);
      return {
        success: result.success,
        error: result.success ? undefined : result.stderr || result.error,
        tag: name,
        remote
      };
    }

    case 'push-all': {
      const remote = options.remote || 'origin';
      const result = await executeGitCommand(workingDir, ['push', remote, '--tags']);
      return {
        success: result.success,
        error: result.success ? undefined : result.stderr || result.error,
        remote
      };
    }

    default:
      return { success: false, error: `Unknown action: ${action}. Supported: list, create, delete, push, push-all` };
  }
}

/**
 * Rebase operations
 */
async function gitRebase(action: string, target?: string, cwd?: string): Promise<RebaseResult> {
  const workingDir = validateCwd(cwd);

  switch (action) {
    case 'start': {
      if (!target) {
        return { success: false, error: 'Target branch/commit is required' };
      }
      const result = await executeGitCommand(workingDir, ['rebase', target]);
      return {
        success: result.success,
        error: result.success ? undefined : result.stderr || result.error,
        target,
        summary: result.stdout
      };
    }

    case 'continue': {
      const result = await executeGitCommand(workingDir, ['rebase', '--continue']);
      return {
        success: result.success,
        error: result.success ? undefined : result.stderr || result.error,
        summary: result.stdout
      };
    }

    case 'abort': {
      const result = await executeGitCommand(workingDir, ['rebase', '--abort']);
      return {
        success: result.success,
        error: result.success ? undefined : result.stderr || result.error
      };
    }

    case 'skip': {
      const result = await executeGitCommand(workingDir, ['rebase', '--skip']);
      return {
        success: result.success,
        error: result.success ? undefined : result.stderr || result.error
      };
    }

    default:
      return { success: false, error: `Unknown action: ${action}. Supported: start, continue, abort, skip` };
  }
}

/**
 * Cherry pick commits
 */
async function gitCherryPick(commit: string, cwd?: string, options: CherryPickOptions = {}): Promise<CherryPickResult> {
  const workingDir = validateCwd(cwd);

  if (!commit || typeof commit !== 'string') {
    return { success: false, error: 'Commit hash is required', commit: '' };
  }

  // Validate commit to prevent option injection
  if (commit.startsWith('-')) {
    return { success: false, error: 'Invalid commit: must not start with -', commit: '' };
  }

  const args: string[] = ['cherry-pick'];

  if (options.noCommit) {
    args.push('--no-commit');
  }

  if (options.signoff) {
    args.push('--signoff');
  }

  args.push(commit);

  const result = await executeGitCommand(workingDir, args);

  return {
    success: result.success,
    error: result.success ? undefined : result.stderr || result.error,
    commit,
    summary: result.stdout
  };
}

/**
 * View line-by-line annotations
 */
async function gitBlame(file: string, cwd?: string, options: BlameOptions = {}): Promise<BlameResult> {
  const workingDir = validateCwd(cwd);
  const validatedFile = validateFilePath(file, workingDir);

  const args: string[] = ['blame'];

  if (options.lineNumbers) {
    args.push('-n');
  }

  if (options.email) {
    args.push('-e');
  }

  args.push(validatedFile);

  const result = await executeGitCommand(workingDir, args);

  return {
    success: result.success,
    error: result.success ? undefined : result.stderr || result.error,
    file,
    blame: result.stdout
  };
}

/**
 * View commit details
 */
async function gitShow(commit: string, cwd?: string, options: ShowOptions = {}): Promise<ShowResult> {
  const workingDir = validateCwd(cwd);

  if (!commit || typeof commit !== 'string') {
    return { success: false, error: 'Commit hash is required', commit: '', output: '' };
  }

  // Validate commit to prevent option injection
  if (commit.startsWith('-')) {
    return { success: false, error: 'Invalid commit: must not start with -', commit: '', output: '' };
  }

  const args: string[] = ['show'];

  if (options.stat) {
    args.push('--stat');
  }

  if (options.nameOnly) {
    args.push('--name-only');
  }

  if (options.file) {
    const validatedFile = validateFilePath(options.file, workingDir);
    // Git tree notation requires relative paths, not absolute
    const relativeFile = path.relative(workingDir, validatedFile);
    args.push(`${commit}:${relativeFile}`);
  } else {
    args.push(commit);
  }

  const result = await executeGitCommand(workingDir, args);

  return {
    success: result.success,
    error: result.success ? undefined : result.stderr || result.error,
    commit,
    output: result.stdout
  };
}

// ============================================================================
// PR Creation (GitHub CLI)
// ============================================================================

/**
 * Create a pull request using GitHub CLI (gh)
 * This follows modern PR best practices and enforces repository PR templates
 */
async function gitPr(
  cwd?: string,
  base?: string,
  title?: string,
  body?: string,
  options: PrOptions = {}
): Promise<PrResult> {
  const workingDir = validateCwd(cwd);

  // Step 1: Validate it's a git repository
  await validateGitRepo(workingDir);

  // Step 2: Get current branch name
  const branchResult = await executeGitCommand(workingDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branchResult.success) {
    return {
      success: false,
      error: `Failed to get current branch: ${branchResult.error}`,
      summary: ''
    };
  }
  const currentBranch = branchResult.stdout.trim();
  if (!currentBranch || currentBranch === 'HEAD') {
    return {
      success: false,
      error: 'Not on a valid branch (detached HEAD?)',
      summary: ''
    };
  }

  const shouldAutoPush = options.autoPush !== false;

  if (shouldAutoPush) {
    // Step 3: Check if branch is ahead of remote (has commits to push)
    const fetchResult = await executeGitCommand(workingDir, ['fetch', 'origin', currentBranch]);
    // fetch might fail if branch doesn't exist on remote yet (that's OK)

    // Check if there are local commits not on remote
    const aheadResult = await executeGitCommand(workingDir, ['rev-list', '--count', `origin/${currentBranch}..HEAD`]);
    const hasUnpushedCommits = aheadResult.success && parseInt(aheadResult.stdout.trim()) > 0;

    // Step 4: Push branch if it has unpushed commits
    if (hasUnpushedCommits) {
      const pushResult = await gitPush('origin', currentBranch, workingDir, false);
      if (!pushResult.success) {
        return {
          success: false,
          error: `Failed to push branch to remote: ${pushResult.error}`,
          head: currentBranch,
          base: base || 'main',
          summary: ''
        };
      }
    }
  }

  // Step 5: Build gh pr create command
  const args: string[] = ['pr', 'create'];

  // Add base branch if specified
  if (base) {
    args.push('--base', base);
  }

  // Add title if provided
  if (title) {
    args.push('--title', title);
  }

  // Add body if provided
  if (body) {
    args.push('--body', body);
  }

  // Add options
  if (options.draft) {
    args.push('--draft');
  }
  if (options.reviewer) {
    args.push('--reviewer', options.reviewer);
  }
  if (options.assignee) {
    args.push('--assignee', options.assignee);
  }
  if (options.label) {
    args.push('--label', options.label);
  }
  if (options.project) {
    args.push('--project', options.project);
  }
  if (options.milestone) {
    args.push('--milestone', options.milestone);
  }

  if (!shouldAutoPush) {
    args.push('--no-push');
  }

  // Execute gh command
  const result = await executeGitCommand(workingDir, args, { timeout: 60000 });

  if (!result.success) {
    return {
      success: false,
      error: result.stderr || result.error || 'Unknown error creating PR',
      head: currentBranch,
      base: base || 'main',
      summary: ''
    };
  }

  // Parse output to extract PR number and URL
  // gh pr create typically outputs: "https://github.com/owner/repo/pull/123"
  const output = result.stdout.trim();
  const prMatch = output.match(/(https?:\/\/github\.com[^\s]+\/pull\/\d+)/);
  const prNumberMatch = output.match(/\/pull\/(\d+)/);

  const prUrl = prMatch ? prMatch[1] : undefined;
  const prNumber = prNumberMatch ? parseInt(prNumberMatch[1]) : undefined;

  let resultSummary = `Pull request created successfully!\n\nBranch: ${currentBranch}\nTarget: ${base || 'main'}\n${prUrl ? `URL: ${prUrl}` : ''}`;

  // If deleteBranch option is set, delete the branch after PR creation
  if (options.deleteBranch) {
    try {
      // Switch to base branch (or main) to avoid being on the branch to delete
      const targetBase = base || 'main';
      // Try to checkout base branch
      try {
        await executeGitCommand(workingDir, ['checkout', targetBase]);
      } catch (checkoutErr) {
        // Ignore checkout errors, maybe base doesn't exist locally; try master
        try {
          await executeGitCommand(workingDir, ['checkout', 'master']);
        } catch (e) {
          // Can't switch, will skip local deletion
        }
      }

      // Delete remote branch
      await executeGitCommand(workingDir, ['push', 'origin', '--delete', currentBranch]);

      // Delete local branch (force)
      try {
        await executeGitCommand(workingDir, ['branch', '-D', currentBranch]);
      } catch (e) {
        // Local deletion might fail if branch is current or doesn't exist; ignore
      }

      resultSummary += `\n\nBranch cleanup completed: deleted remote branch and local branch.`;
    } catch (branchErr) {
      // Don't fail PR creation if cleanup fails
      resultSummary += `\n\nWarning: branch cleanup failed: ${(branchErr as Error).message}`;
    }
  }

  return {
    success: true,
    prUrl,
    prNumber,
    remote: 'origin',
    head: currentBranch,
    base: base || 'main',
    summary: resultSummary
  };
}

// ============================================================================
// Formatting Helpers
// ============================================================================

function formatStatus(status: StatusResult): string {
  if (!status.success) {
    return `**Git Status Error**\n\n${status.error}`;
  }

  if (status.clean) {
    return `**Clean Working Tree**\n\nBranch: \`${status.branch}\``;
  }

  const lines: string[] = [`**Git Status**\n`, `Branch: \`${status.branch}\``];

  if (status.upstream) {
    lines.push(`Upstream: \`${status.upstream}\``);
  }

  if (status.unmerged && status.unmerged.length > 0) {
    lines.push(`\n**Unmerged Files (${status.unmerged.length}):**`);
    status.unmerged.forEach(f => {
      lines.push(`  [!] ${f.file} (index: ${f.indexStatus}, worktree: ${f.worktreeStatus})`);
    });
  }

  if (status.staged.length > 0) {
    lines.push(`\n**Staged Changes (${status.staged.length}):**`);
    status.staged.forEach(f => {
      const icon = f.status === 'modified' ? '[M]' : f.status === 'added' ? '[A]' : f.status === 'deleted' ? '[D]' : f.status === 'renamed' ? '[R]' : f.status === 'copied' ? '[C]' : `[${f.status}]`;
      lines.push(`  ${icon} ${f.file}`);
    });
  }

  if (status.unstaged.length > 0) {
    lines.push(`\n**Unstaged Changes (${status.unstaged.length}):**`);
    status.unstaged.forEach(f => {
      const icon = f.status === 'modified' ? '[M]' : f.status === 'deleted' ? '[D]' : f.status === 'renamed' ? '[R]' : `[${f.status}]`;
      lines.push(`  ${icon} ${f.file}`);
    });
  }

  if (status.untracked.length > 0) {
    lines.push(`\n**Untracked Files (${status.untracked.length}):**`);
    status.untracked.forEach(f => {
      lines.push(`  [?] ${f}`);
    });
  }

  return lines.join('\n');
}

function formatDiff(diffResult: DiffResult): string {
  if (!diffResult.success) {
    return `**Git Diff Error**\n\n${diffResult.error}`;
  }

  if (!diffResult.hasChanges) {
    return '**No Changes**\n\nNo differences to show.';
  }

  const lines = ['**Changes**\n', '```diff', diffResult.diff, '```'];
  return lines.join('\n');
}

function formatLog(logResult: LogResult): string {
  if (!logResult.success) {
    return `**Git Log Error**\n\n${logResult.error}`;
  }

  if (logResult.commits.length === 0) {
    return '**Commit History**\n\nNo commits found.';
  }

  const lines = [`**Recent Commits (${logResult.count})**\n`];
  logResult.commits.forEach((commit, i) => {
    const refStr = commit.refs ? ` (${commit.refs})` : '';
    lines.push(`${i + 1}. \`${commit.hash.substring(0, 7)}\`${refStr} - ${commit.message}`);
  });

  return lines.join('\n');
}

function formatBranches(branchResult: BranchResult): string {
  if (!branchResult.success || !branchResult.branches) {
    return `**Git Branch Error**\n\n${branchResult.error}`;
  }

  if (branchResult.branches.length === 0) {
    return '**Branches**\n\nNo branches found.';
  }

  const lines = ['**Branches**\n'];
  branchResult.branches.forEach(branch => {
    const icon = branch.current ? '->' : branch.remote ? '[remote]' : '[local]';
    lines.push(`${icon} ${branch.name}`);
  });

  return lines.join('\n');
}

function formatRemotes(remoteResult: RemoteResult): string {
  if (!remoteResult.success || !remoteResult.remotes) {
    return `**Git Remote Error**\n\n${remoteResult.error}`;
  }

  const remoteNames = Object.keys(remoteResult.remotes);
  if (remoteNames.length === 0) {
    return '**Remotes**\n\nNo remotes configured.';
  }

  const lines = ['**Remotes**\n'];
  for (const name of remoteNames) {
    const remote = remoteResult.remotes[name];
    lines.push(`${name}:`);
    if (remote.fetch) lines.push(`  fetch: ${remote.fetch}`);
    if (remote.push) lines.push(`  push: ${remote.push}`);
  }

  return lines.join('\n');
}

// ============================================================================
// PI Agent Extension Factory
// ============================================================================

interface ToolExecuteResult {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
  isError?: boolean;
}

export default async function (pi: ExtensionAPI): Promise<void> {
  // Register git_status tool
  pi.registerTool({
    name: 'git_status',
    label: 'Git Status',
    description: 'Check git repository status. Shows staged, unstaged, untracked, and unmerged files.',
    parameters: Type.Object({
      cwd: Type.Optional(Type.String({ description: 'Working directory (defaults to current directory)' }))
    }),
    execute: async (
      toolCallId: string,
      params: { cwd?: string },
      signal: AbortSignal | undefined,
      onUpdate: ((update: any) => void) | undefined,
      ctx: any
    ): Promise<ToolExecuteResult> => {
      try {
        const status = await gitStatus(params?.cwd);
        const text = formatStatus(status);
        return { content: [{ type: 'text', text }], details: {} };
      } catch (error) {
        const err = error as Error;
        return {
          content: [{ type: 'text', text: `**Git Status Failed**\n\n${err.message}` }],
          details: {},
          isError: true
        };
      }
    }
  });

  // Register git_diff tool
  pi.registerTool({
    name: 'git_diff',
    label: 'Git Diff',
    description: 'View git differences. Can show staged or unstaged changes, or diff for a specific file.',
    parameters: Type.Object({
      staged: Type.Optional(Type.Boolean({ description: 'Show staged changes (default: false for unstaged)' })),
      file: Type.Optional(Type.String({ description: 'Show diff for a specific file (optional)' })),
      stat: Type.Optional(Type.Boolean({ description: 'Show diffstat instead of full diff' })),
      nameOnly: Type.Optional(Type.Boolean({ description: 'Show only filenames changed' })),
      cwd: Type.Optional(Type.String({ description: 'Working directory' }))
    }),
    execute: async (
      toolCallId: string,
      params: { cwd?: string; staged?: boolean; file?: string; stat?: boolean; nameOnly?: boolean },
      signal: AbortSignal | undefined,
      onUpdate: ((update: any) => void) | undefined,
      ctx: any
    ): Promise<ToolExecuteResult> => {
      try {
        const diffResult = await gitDiff(params?.cwd, {
          staged: params?.staged || false,
          file: params?.file,
          stat: params?.stat || false,
          nameOnly: params?.nameOnly || false
        });
        const text = formatDiff(diffResult);
        return { content: [{ type: 'text', text }], details: {} };
      } catch (error) {
        const err = error as Error;
        return {
          content: [{ type: 'text', text: `**Git Diff Failed**\n\n${err.message}` }],
          details: {},
          isError: true
        };
      }
    }
  });

  // Register git_add tool
  pi.registerTool({
    name: 'git_add',
    label: 'Git Add',
    description: 'Stage files for commit. Use "git add" semantics.',
    parameters: Type.Object({
      files: Type.Array(Type.String(), { description: 'Files to stage (can use "." for all)' }),
      cwd: Type.Optional(Type.String({ description: 'Working directory' }))
    }),
    execute: async (
      toolCallId: string,
      params: { files?: string[]; cwd?: string },
      signal: AbortSignal | undefined,
      onUpdate: ((update: any) => void) | undefined,
      ctx: any
    ): Promise<ToolExecuteResult> => {
      try {
        const files = params?.files;
        if (!files || files.length === 0) {
          return {
            content: [{ type: 'text', text: '**Git Add Failed**\n\nNo files specified. Use ["."] to stage all changes.' }],
            details: {},
            isError: true
          };
        }

        const result = await gitAdd(files, params?.cwd);

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Add Failed**\n\n${result.error}` }],
            details: {},
            isError: true
          };
        }

        const text = `**Files Staged**\n\nStaged ${result.staged.length} file(s):\n${result.staged.map(f => `- ${f}`).join('\n')}`;
        return { content: [{ type: 'text', text }], details: {} };
      } catch (error) {
        const err = error as Error;
        return {
          content: [{ type: 'text', text: `**Git Add Failed**\n\n${err.message}` }],
          details: {},
          isError: true
        };
      }
    }
  });

  // Register git_commit tool
  pi.registerTool({
    name: 'git_commit',
    label: 'Git Commit',
    description: 'Create a git commit with a conventional commit message. For complex changes, provide a body explaining what changed, why, and the impact.',
    parameters: Type.Object({
      message: Type.String({ description: 'Commit message. For simple changes: "type(scope): description". For complex changes: "type(scope): summary" followed by detailed body explaining what changed across which files, why, and the impact.' }),
      cwd: Type.Optional(Type.String({ description: 'Working directory' }))
    }),
    execute: async (
      toolCallId: string,
      params: { message?: string; cwd?: string },
      signal: AbortSignal | undefined,
      onUpdate: ((update: any) => void) | undefined,
      ctx: any
    ): Promise<ToolExecuteResult> => {
      try {
        const message = params?.message;
        if (!message || typeof message !== 'string' || message.trim() === '') {
          return {
            content: [{ type: 'text', text: '**Git Commit Failed**\n\nCommit message is required.\n\nFor simple changes:\n  "type(scope): description"\n\nFor complex changes (3+ files, non-obvious changes):\n  "type(scope): summary"\n\n  "What changed:\n  - File A: did X\n  - File B: did Y\n\n  Why: the problem this solves\n\n  Impact: behavioral or API changes"' }],
            details: {},
            isError: true
          };
        }

        const result = await gitCommit(message, params?.cwd);

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Commit Failed**\n\n${result.error}` }],
            details: {},
            isError: true
          };
        }

        const text = result.isDetailed
          ? `**Commit Created (detailed)**\n\n**Branch:** \`${result.branch}\`\n**Hash:** \`${result.hash}\`\n**Summary:** ${result.message}\n\nFull message includes body with change details.`
          : `**Commit Created**\n\n**Branch:** \`${result.branch}\`\n**Hash:** \`${result.hash}\`\n**Message:** ${result.message}`;
        return { content: [{ type: 'text', text }], details: {} };
      } catch (error) {
        const err = error as Error;
        return {
          content: [{ type: 'text', text: `**Git Commit Failed**\n\n${err.message}` }],
          details: {},
          isError: true
        };
      }
    }
  });

  // Register git_branch tool
  pi.registerTool({
    name: 'git_branch',
    label: 'Git Branch',
    description: 'Branch operations: list, create, switch, delete, force_delete, merge.',
    parameters: Type.Object({
      action: Type.String({ description: 'Action: list, create, switch, delete, force_delete, merge', enum: ['list', 'create', 'switch', 'delete', 'force_delete', 'merge'] }),
      name: Type.Optional(Type.String({ description: 'Branch name (required for create, switch, delete, force_delete, merge)' })),
      cwd: Type.Optional(Type.String({ description: 'Working directory' }))
    }),
    execute: async (
      toolCallId: string,
      params: { action?: string; name?: string; cwd?: string },
      signal: AbortSignal | undefined,
      onUpdate: ((update: any) => void) | undefined,
      ctx: any
    ): Promise<ToolExecuteResult> => {
      try {
        const result = await gitBranch(params?.action || '', params?.name, params?.cwd);

        if (!result.success) {
          const hint = result.hint ? `\n\n${result.hint}` : '';
          return {
            content: [{ type: 'text', text: `**Git Branch Failed**\n\n${result.error}${hint}` }],
            details: {},
            isError: true
          };
        }

        let text: string;
        switch (params?.action) {
          case 'list':
            text = formatBranches(result);
            break;
          case 'create':
            text = `**Branch Created**\n\nCreated branch: \`${result.branch}\``;
            break;
          case 'switch':
            text = `**Branch Switched**\n\nNow on branch: \`${result.branch}\``;
            break;
          case 'delete':
          case 'force_delete':
            text = `**Branch ${params?.action === 'force_delete' ? 'Force ' : ''}Deleted**\n\nDeleted branch: \`${result.branch}\``;
            break;
          case 'merge':
            text = `**Branch Merged**\n\nMerged \`${result.branch}\` into current branch.\n\n${result.summary}`;
            break;
          default:
            text = `**Git Branch Operation Completed**`;
        }

        return { content: [{ type: 'text', text }], details: {} };
      } catch (error) {
        const err = error as Error;
        return {
          content: [{ type: 'text', text: `**Git Branch Failed**\n\n${err.message}` }],
          details: {},
          isError: true
        };
      }
    }
  });

  // Register git_log tool
  pi.registerTool({
    name: 'git_log',
    label: 'Git Log',
    description: 'View commit history.',
    parameters: Type.Object({
      count: Type.Optional(Type.Number({ description: 'Number of commits to show (default: 10)' })),
      cwd: Type.Optional(Type.String({ description: 'Working directory' }))
    }),
    execute: async (
      toolCallId: string,
      params: { count?: number; cwd?: string },
      signal: AbortSignal | undefined,
      onUpdate: ((update: any) => void) | undefined,
      ctx: any
    ): Promise<ToolExecuteResult> => {
      try {
        const result = await gitLog(params?.count || 10, params?.cwd);
        const text = formatLog(result);
        return { content: [{ type: 'text', text }], details: {} };
      } catch (error) {
        const err = error as Error;
        return {
          content: [{ type: 'text', text: `**Git Log Failed**\n\n${err.message}` }],
          details: {},
          isError: true
        };
      }
    }
  });

  // Register git_stash tool
  pi.registerTool({
    name: 'git_stash',
    label: 'Git Stash',
    description: 'Stash operations: save, list, pop, apply, drop, clear, show.',
    parameters: Type.Object({
      action: Type.String({ description: 'Action: save, list, pop, apply, drop, clear, show', enum: ['save', 'list', 'pop', 'apply', 'drop', 'clear', 'show'] }),
      index: Type.Optional(Type.Number({ description: 'Stash index (optional, defaults to latest)' })),
      cwd: Type.Optional(Type.String({ description: 'Working directory' }))
    }),
    execute: async (
      toolCallId: string,
      params: { action?: string; index?: number; cwd?: string },
      signal: AbortSignal | undefined,
      onUpdate: ((update: any) => void) | undefined,
      ctx: any
    ): Promise<ToolExecuteResult> => {
      try {
        const result = await gitStash(params?.action || '', params?.cwd, params?.index ?? null);

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Stash Failed**\n\n${result.error}` }],
            details: {},
            isError: true
          };
        }

        let text: string;
        switch (params?.action) {
          case 'save':
            text = `**Changes Stashed**\n\n${result.summary}`;
            break;
          case 'list':
            text = `**Stash List** (${result.count})\n\n${result.stashes?.join('\n')}`;
            break;
          case 'pop':
            text = `**Stash Popped**\n\n${result.summary}`;
            break;
          case 'apply':
            text = `**Stash Applied**\n\n${result.summary}`;
            break;
          case 'drop':
            text = `**Stash Dropped**\n\n${result.summary}`;
            break;
          case 'clear':
            text = `**Stash Cleared**\n\nAll stashes removed.`;
            break;
          case 'show':
            text = `**Stash Details**\n\n\`\`\`diff\n${result.diff}\n\`\`\``;
            break;
          default:
            text = `**Git Stash Operation Completed**`;
        }

        return { content: [{ type: 'text', text }], details: {} };
      } catch (error) {
        const err = error as Error;
        return {
          content: [{ type: 'text', text: `**Git Stash Failed**\n\n${err.message}` }],
          details: {},
          isError: true
        };
      }
    }
  });

  // Register git_push tool
  pi.registerTool({
    name: 'git_push',
    label: 'Git Push',
    description: 'Push commits to a remote repository.',
    parameters: Type.Object({
      remote: Type.Optional(Type.String({ description: 'Remote name (default: origin)' })),
      branch: Type.Optional(Type.String({ description: 'Branch name to push (optional, pushes current branch if not specified)' })),
      force: Type.Optional(Type.Boolean({ description: 'Force push with lease (use with caution)' })),
      cwd: Type.Optional(Type.String({ description: 'Working directory' }))
    }),
    execute: async (
      toolCallId: string,
      params: { remote?: string; branch?: string; force?: boolean; cwd?: string },
      signal: AbortSignal | undefined,
      onUpdate: ((update: any) => void) | undefined,
      ctx: any
    ): Promise<ToolExecuteResult> => {
      try {
        const result = await gitPush(params?.remote, params?.branch ?? null, params?.cwd, params?.force || false);

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Push Failed**\n\n${result.error}` }],
            details: {},
            isError: true
          };
        }

        const branchInfo = result.branch ? ` branch \`${result.branch}\`` : ' current branch';
        const text = `**Pushed to Remote**\n\nPushed${branchInfo} to \`${result.remote}\`\n\n${result.summary}`;
        return { content: [{ type: 'text', text }], details: {} };
      } catch (error) {
        const err = error as Error;
        return {
          content: [{ type: 'text', text: `**Git Push Failed**\n\n${err.message}` }],
          details: {},
          isError: true
        };
      }
    }
  });

  // Register git_pull tool
  pi.registerTool({
    name: 'git_pull',
    label: 'Git Pull',
    description: 'Pull changes from a remote repository.',
    parameters: Type.Object({
      remote: Type.Optional(Type.String({ description: 'Remote name (default: origin)' })),
      branch: Type.Optional(Type.String({ description: 'Branch name to pull (optional, pulls current branch if not specified)' })),
      cwd: Type.Optional(Type.String({ description: 'Working directory' }))
    }),
    execute: async (
      toolCallId: string,
      params: { remote?: string; branch?: string; cwd?: string },
      signal: AbortSignal | undefined,
      onUpdate: ((update: any) => void) | undefined,
      ctx: any
    ): Promise<ToolExecuteResult> => {
      try {
        const result = await gitPull(params?.remote, params?.branch ?? null, params?.cwd);

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Pull Failed**\n\n${result.error}` }],
            details: {},
            isError: true
          };
        }

        const branchInfo = result.branch ? ` branch \`${result.branch}\`` : ' current branch';
        const text = `**Pulled from Remote**\n\nPulled${branchInfo} from \`${result.remote}\`\n\n${result.summary}`;
        return { content: [{ type: 'text', text }], details: {} };
      } catch (error) {
        const err = error as Error;
        return {
          content: [{ type: 'text', text: `**Git Pull Failed**\n\n${err.message}` }],
          details: {},
          isError: true
        };
      }
    }
  });

  // Register git_remote tool
  pi.registerTool({
    name: 'git_remote',
    label: 'Git Remote',
    description: 'Remote repository management: list, add, remove, set-url.',
    parameters: Type.Object({
      action: Type.String({ description: 'Action: list, add, remove, set-url', enum: ['list', 'add', 'remove', 'set-url'] }),
      name: Type.Optional(Type.String({ description: 'Remote name (required for add, remove, set-url)' })),
      url: Type.Optional(Type.String({ description: 'Remote URL (required for add, set-url)' })),
      cwd: Type.Optional(Type.String({ description: 'Working directory' }))
    }),
    execute: async (
      toolCallId: string,
      params: { action?: string; name?: string; url?: string; cwd?: string },
      signal: AbortSignal | undefined,
      onUpdate: ((update: any) => void) | undefined,
      ctx: any
    ): Promise<ToolExecuteResult> => {
      try {
        const result = await gitRemote(params?.action || '', params?.name, params?.url, params?.cwd);

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Remote Failed**\n\n${result.error}` }],
            details: {},
            isError: true
          };
        }

        let text: string;
        switch (params?.action) {
          case 'list':
            text = formatRemotes(result);
            break;
          case 'add':
            text = `**Remote Added**\n\nAdded \`${result.remote}\` -> \`${result.url}\``;
            break;
          case 'remove':
            text = `**Remote Removed**\n\nRemoved \`${result.remote}\``;
            break;
          case 'set-url':
            text = `**Remote URL Updated**\n\nUpdated \`${result.remote}\` -> \`${result.url}\``;
            break;
          default:
            text = `**Git Remote Operation Completed**`;
        }

        return { content: [{ type: 'text', text }], details: {} };
      } catch (error) {
        const err = error as Error;
        return {
          content: [{ type: 'text', text: `**Git Remote Failed**\n\n${err.message}` }],
          details: {},
          isError: true
        };
      }
    }
  });

  // Register git_reset tool
  pi.registerTool({
    name: 'git_reset',
    label: 'Git Reset',
    description: 'Reset current HEAD to specified state. Modes: soft (keep changes staged), mixed (keep changes unstaged), hard (discard changes).',
    parameters: Type.Object({
      mode: Type.Optional(Type.String({ description: 'Reset mode: soft, mixed, hard', enum: ['soft', 'mixed', 'hard'] })),
      target: Type.Optional(Type.String({ description: 'Target commit (default: HEAD)' })),
      cwd: Type.Optional(Type.String({ description: 'Working directory' }))
    }),
    execute: async (
      toolCallId: string,
      params: { mode?: string; target?: string; cwd?: string },
      signal: AbortSignal | undefined,
      onUpdate: ((update: any) => void) | undefined,
      ctx: any
    ): Promise<ToolExecuteResult> => {
      try {
        const result = await gitReset(params?.mode || 'mixed', params?.target || 'HEAD', params?.cwd);

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Reset Failed**\n\n${result.error}` }],
            details: {},
            isError: true
          };
        }

        const text = `**Git Reset Completed**\n\nMode: \`${result.mode}\`\nTarget: \`${result.target}\``;
        return { content: [{ type: 'text', text }], details: {} };
      } catch (error) {
        const err = error as Error;
        return {
          content: [{ type: 'text', text: `**Git Reset Failed**\n\n${err.message}` }],
          details: {},
          isError: true
        };
      }
    }
  });

  // Register git_tag tool
  pi.registerTool({
    name: 'git_tag',
    label: 'Git Tag',
    description: 'Tag management: list, create, delete, push, push-all.',
    parameters: Type.Object({
      action: Type.String({ description: 'Action: list, create, delete, push, push-all', enum: ['list', 'create', 'delete', 'push', 'push-all'] }),
      name: Type.Optional(Type.String({ description: 'Tag name (required for create, delete, push)' })),
      target: Type.Optional(Type.String({ description: 'Target commit (for create)' })),
      message: Type.Optional(Type.String({ description: 'Tag message (for annotated tags)' })),
      remote: Type.Optional(Type.String({ description: 'Remote name (for push, default: origin)' })),
      cwd: Type.Optional(Type.String({ description: 'Working directory' }))
    }),
    execute: async (
      toolCallId: string,
      params: { action?: string; name?: string; target?: string; message?: string; remote?: string; cwd?: string },
      signal: AbortSignal | undefined,
      onUpdate: ((update: any) => void) | undefined,
      ctx: any
    ): Promise<ToolExecuteResult> => {
      try {
        const options: TagOptions = {
          message: params?.message,
          remote: params?.remote
        };
        const result = await gitTag(params?.action || '', params?.name, params?.target, params?.cwd, options);

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Tag Failed**\n\n${result.error}` }],
            details: {},
            isError: true
          };
        }

        let text: string;
        switch (params?.action) {
          case 'list':
            text = `**Tags** (${result.count})\n\n${result.tags?.join('\n')}`;
            break;
          case 'create':
            text = `**Tag Created**\n\nTag: \`${result.tag}\`\nTarget: \`${result.target}\``;
            break;
          case 'delete':
            text = `**Tag Deleted**\n\nTag: \`${result.tag}\``;
            break;
          case 'push':
            text = `**Tag Pushed**\n\nTag: \`${result.tag}\`\nRemote: \`${result.remote}\``;
            break;
          case 'push-all':
            text = `**All Tags Pushed**\n\nRemote: \`${result.remote}\``;
            break;
          default:
            text = `**Git Tag Operation Completed**`;
        }

        return { content: [{ type: 'text', text }], details: {} };
      } catch (error) {
        const err = error as Error;
        return {
          content: [{ type: 'text', text: `**Git Tag Failed**\n\n${err.message}` }],
          details: {},
          isError: true
        };
      }
    }
  });

  // Register git_rebase tool
  pi.registerTool({
    name: 'git_rebase',
    label: 'Git Rebase',
    description: 'Rebase operations: start, continue, abort, skip.',
    parameters: Type.Object({
      action: Type.String({ description: 'Action: start, continue, abort, skip', enum: ['start', 'continue', 'abort', 'skip'] }),
      target: Type.Optional(Type.String({ description: 'Target branch/commit (for start action)' })),
      cwd: Type.Optional(Type.String({ description: 'Working directory' }))
    }),
    execute: async (
      toolCallId: string,
      params: { action?: string; target?: string; cwd?: string },
      signal: AbortSignal | undefined,
      onUpdate: ((update: any) => void) | undefined,
      ctx: any
    ): Promise<ToolExecuteResult> => {
      try {
        const result = await gitRebase(params?.action || '', params?.target, params?.cwd);

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Rebase Failed**\n\n${result.error}` }],
            details: {},
            isError: true
          };
        }

        let text: string;
        switch (params?.action) {
          case 'start':
            text = `**Rebase Started**\n\nRebasing onto \`${result.target}\``;
            break;
          case 'continue':
            text = `**Rebase Continued**\n\n${result.summary}`;
            break;
          case 'abort':
            text = `**Rebase Aborted**\n\nReturned to original state.`;
            break;
          case 'skip':
            text = `**Commit Skipped**\n\n${result.summary}`;
            break;
          default:
            text = `**Git Rebase Operation Completed**`;
        }

        return { content: [{ type: 'text', text }], details: {} };
      } catch (error) {
        const err = error as Error;
        return {
          content: [{ type: 'text', text: `**Git Rebase Failed**\n\n${err.message}` }],
          details: {},
          isError: true
        };
      }
    }
  });

  // Register git_cherry_pick tool
  pi.registerTool({
    name: 'git_cherry_pick',
    label: 'Git Cherry Pick',
    description: 'Cherry pick commits from other branches.',
    parameters: Type.Object({
      commit: Type.String({ description: 'Commit hash to cherry pick' }),
      noCommit: Type.Optional(Type.Boolean({ description: 'Stage changes without committing' })),
      signoff: Type.Optional(Type.Boolean({ description: 'Add Signed-off-by line' })),
      cwd: Type.Optional(Type.String({ description: 'Working directory' }))
    }),
    execute: async (
      toolCallId: string,
      params: { commit?: string; noCommit?: boolean; signoff?: boolean; cwd?: string },
      signal: AbortSignal | undefined,
      onUpdate: ((update: any) => void) | undefined,
      ctx: any
    ): Promise<ToolExecuteResult> => {
      try {
        const result = await gitCherryPick(params?.commit || '', params?.cwd, {
          noCommit: params?.noCommit || false,
          signoff: params?.signoff || false
        });

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Cherry Pick Failed**\n\n${result.error}` }],
            details: {},
            isError: true
          };
        }

        const text = `**Cherry Picked**\n\nCommit: \`${result.commit}\`\n\n${result.summary}`;
        return { content: [{ type: 'text', text }], details: {} };
      } catch (error) {
        const err = error as Error;
        return {
          content: [{ type: 'text', text: `**Git Cherry Pick Failed**\n\n${err.message}` }],
          details: {},
          isError: true
        };
      }
    }
  });

  // Register git_blame tool
  pi.registerTool({
    name: 'git_blame',
    label: 'Git Blame',
    description: 'Show line-by-line annotation of a file.',
    parameters: Type.Object({
      file: Type.String({ description: 'File to blame' }),
      lineNumbers: Type.Optional(Type.Boolean({ description: 'Show line numbers' })),
      email: Type.Optional(Type.Boolean({ description: 'Show email addresses instead of author names' })),
      cwd: Type.Optional(Type.String({ description: 'Working directory' }))
    }),
    execute: async (
      toolCallId: string,
      params: { file?: string; lineNumbers?: boolean; email?: boolean; cwd?: string },
      signal: AbortSignal | undefined,
      onUpdate: ((update: any) => void) | undefined,
      ctx: any
    ): Promise<ToolExecuteResult> => {
      try {
        const result = await gitBlame(params?.file || '', params?.cwd, {
          lineNumbers: params?.lineNumbers || false,
          email: params?.email || false
        });

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Blame Failed**\n\n${result.error}` }],
            details: {},
            isError: true
          };
        }

        const text = `**Blame for ${result.file}**\n\n\`\`\`\n${result.blame}\n\`\`\``;
        return { content: [{ type: 'text', text }], details: {} };
      } catch (error) {
        const err = error as Error;
        return {
          content: [{ type: 'text', text: `**Git Blame Failed**\n\n${err.message}` }],
          details: {},
          isError: true
        };
      }
    }
  });

  // Register git_show tool
  pi.registerTool({
    name: 'git_show',
    label: 'Git Show',
    description: 'Show commit details.',
    parameters: Type.Object({
      commit: Type.String({ description: 'Commit hash or reference' }),
      file: Type.Optional(Type.String({ description: 'Show specific file from commit' })),
      stat: Type.Optional(Type.Boolean({ description: 'Show diffstat instead of full diff' })),
      nameOnly: Type.Optional(Type.Boolean({ description: 'Show only filenames changed' })),
      cwd: Type.Optional(Type.String({ description: 'Working directory' }))
    }),
    execute: async (
      toolCallId: string,
      params: { commit?: string; file?: string; stat?: boolean; nameOnly?: boolean; cwd?: string },
      signal: AbortSignal | undefined,
      onUpdate: ((update: any) => void) | undefined,
      ctx: any
    ): Promise<ToolExecuteResult> => {
      try {
        const result = await gitShow(params?.commit || '', params?.cwd, {
          file: params?.file,
          stat: params?.stat || false,
          nameOnly: params?.nameOnly || false
        });

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Show Failed**\n\n${result.error}` }],
            details: {},
            isError: true
          };
        }

        const text = `**Commit ${result.commit}**\n\n\`\`\`\n${result.output}\n\`\`\``;
        return { content: [{ type: 'text', text }], details: {} };
      } catch (error) {
        const err = error as Error;
        return {
          content: [{ type: 'text', text: `**Git Show Failed**\n\n${err.message}` }],
          details: {},
          isError: true
        };
      }
    }
  });

  // Register git_pr tool
  pi.registerTool({
    name: 'git_pr',
    label: 'Git PR',
    description: 'Create a pull request using GitHub CLI (gh). By default, automatically pushes the branch if needed; set autoPush=false to require the branch to already exist on the remote. Follows repo PR templates.',
    parameters: Type.Object({
      base: Type.Optional(Type.String({ description: 'Target branch (default: main)' })),
      title: Type.Optional(Type.String({ description: 'PR title (default: first commit message or "New PR")' })),
      body: Type.Optional(Type.String({ description: 'PR description (default: commit messages)' })),
      draft: Type.Optional(Type.Boolean({ description: 'Create as draft PR' })),
      reviewer: Type.Optional(Type.String({ description: 'Request reviewers (comma-separated for multiple)' })),
      assignee: Type.Optional(Type.String({ description: 'Assign PR to user' })),
      label: Type.Optional(Type.String({ description: 'Add labels (comma-separated for multiple)' })),
      project: Type.Optional(Type.String({ description: 'Add to project' })),
      milestone: Type.Optional(Type.String({ description: 'Add to milestone' })),
      deleteBranch: Type.Optional(Type.Boolean({ description: 'Delete branch after PR creation (remote and local)' })),
      autoPush: Type.Optional(Type.Boolean({ description: 'Automatically push branch before creating PR (default: true). Set to false to require branch already on remote.' })),
      cwd: Type.Optional(Type.String({ description: 'Working directory' }))
    }),
    execute: async (
      toolCallId: string,
      params: {
        base?: string;
        title?: string;
        body?: string;
        draft?: boolean;
        reviewer?: string;
        assignee?: string;
        label?: string;
        project?: string;
        milestone?: string;
        deleteBranch?: boolean;
        autoPush?: boolean;
        cwd?: string;
      },
      signal: AbortSignal | undefined,
      onUpdate: ((update: any) => void) | undefined,
      ctx: any
    ): Promise<ToolExecuteResult> => {
      try {
        const result = await gitPr(
          params?.cwd,
          params?.base,
          params?.title,
          params?.body,
          {
            draft: params?.draft || false,
            reviewer: params?.reviewer,
            assignee: params?.assignee,
            label: params?.label,
            project: params?.project,
            milestone: params?.milestone,
            deleteBranch: params?.deleteBranch || false,
            autoPush: params?.autoPush
          }
        );

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git PR Failed**\n\n${result.error}\n\nHead: ${result.head}\nBase: ${result.base}` }],
            details: {},
            isError: true
          };
        }

        const text = `**Pull Request Created**\n\nBranch: \`${result.head}\` → \`${result.base}\`\n\n${result.summary}`;
        return { content: [{ type: 'text', text }], details: { prUrl: result.prUrl, prNumber: result.prNumber } };
      } catch (error) {
        const err = error as Error;
        return {
          content: [{ type: 'text', text: `**Git PR Failed**\n\n${err.message}` }],
          details: {},
          isError: true
        };
      }
    }
  });
};
