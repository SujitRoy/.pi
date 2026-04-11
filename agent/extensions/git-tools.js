#!/usr/bin/env node

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

const { execFile } = require('child_process');
const util = require('util');
const path = require('path');
const os = require('os');
const fs = require('fs');

const execFileAsync = util.promisify(execFile);

// ============================================================================
// Logging Utility
// ============================================================================

const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
};

function log(message, level = LOG_LEVELS.INFO) {
  const prefix = '[git-tools]';
  const timestamp = new Date().toISOString();
  const logMessage = `${prefix} [${level.toUpperCase()}] ${timestamp} - ${message}`;

  switch (level) {
    case LOG_LEVELS.ERROR:
      console.error(logMessage);
      break;
    case LOG_LEVELS.WARN:
      console.warn(logMessage);
      break;
    case LOG_LEVELS.DEBUG:
      if (process.env.DEBUG === 'git-tools') {
        console.log(logMessage);
      }
      break;
    default:
      console.log(logMessage);
  }
}

// ============================================================================
// Security Utilities
// ============================================================================

/**
 * Validate and sanitize file path to prevent command injection
 */
function validateFilePath(filePath, baseDir) {
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
function validateCwd(cwd) {
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
 * Validate numeric parameter
 */
function validateNumber(value, name, min = 1, max = 1000) {
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
 * Execute a git command with error handling and cancellation support
 */
async function executeGitCommand(cwd, args, options = {}) {
  const {
    timeout = 30000,
    maxBuffer = 10 * 1024 * 1024, // 10MB
    signal = null
  } = options;

  const workingDir = validateCwd(cwd);

  // Build abort promise if signal provided
  const abortPromise = signal
    ? new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          reject(new Error('Operation cancelled'));
        }, { once: true });
      })
    : Promise.resolve();

  try {
    const childProcess = execFile('git', args, {
      cwd: workingDir,
      timeout,
      maxBuffer,
      env: { ...process.env }
    });

    // Attach signal to child process
    if (signal) {
      signal.addEventListener('abort', () => {
        childProcess.kill('SIGTERM');
      }, { once: true });
    }

    const { stdout, stderr } = await Promise.race([
      new Promise((resolve, reject) => {
        childProcess.on('error', reject);
        childProcess.on('close', (code) => {
          if (code === 0) {
            resolve({ stdout: childProcess.stdout, stderr: childProcess.stderr });
          } else {
            const error = new Error(`git exited with code ${code}`);
            error.exitCode = code;
            error.stdout = childProcess.stdout;
            error.stderr = childProcess.stderr;
            reject(error);
          }
        });
      }),
      abortPromise
    ]);

    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim()
    };
  } catch (error) {
    // Preserve full error information
    return {
      success: false,
      error: error.message,
      stdout: error.stdout?.trim() || '',
      stderr: error.stderr?.trim() || '',
      exitCode: error.exitCode || error.code,
      signal: error.signal,
      killed: error.killed,
      originalError: error
    };
  }
}

// ============================================================================
// Git Operations
// ============================================================================

/**
 * Get git status
 */
async function gitStatus(cwd) {
  const workingDir = validateCwd(cwd);
  const result = await executeGitCommand(workingDir, ['status', '--short', '--branch']);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Parse status output with comprehensive status code handling
  const lines = result.stdout.split('\n').filter(line => line.trim());
  const branchLine = lines[0] || '';
  const branchMatch = branchLine.match(/## (.+?)(?:\.\.\.(.+))?$/);

  // Status code mapping
  const statusMap = {
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

  const status = {
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
      status.unmerged.push({ file: filePath, indexStatus: statusMap[indexStatus] || indexStatus, worktreeStatus: statusMap[worktreeStatus] || worktreeStatus });
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
async function gitDiff(cwd, options = {}) {
  const workingDir = validateCwd(cwd);
  const {
    staged = false,
    file = null,
    stat = false,
    nameOnly = false
  } = options;

  const args = ['diff', '--no-color'];

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
    return { success: false, error: result.error };
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
async function gitAdd(files, cwd) {
  if (!files || files.length === 0) {
    return { success: false, error: 'No files specified' };
  }

  const workingDir = validateCwd(cwd);

  // Validate all file paths
  const validatedFiles = [];
  for (const file of files) {
    try {
      validatedFiles.push(validateFilePath(file, workingDir));
    } catch (error) {
      return { success: false, error: `Invalid file "${file}": ${error.message}` };
    }
  }

  const args = ['add', ...validatedFiles];
  const result = await executeGitCommand(workingDir, args);

  return {
    success: result.success,
    error: result.success ? null : result.error,
    staged: result.success ? validatedFiles : []
  };
}

/**
 * Create a commit
 */
async function gitCommit(message, cwd) {
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return { success: false, error: 'Commit message is required' };
  }

  const workingDir = validateCwd(cwd);

  // Check if there's anything staged
  const statusResult = await executeGitCommand(workingDir, ['diff', '--cached', '--quiet']);
  if (statusResult.success) {
    return {
      success: false,
      error: 'No staged changes to commit. Use git_add first.'
    };
  }

  // Use secure temp file creation
  let tmpFile;
  try {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'git-commit-'));
    tmpFile = path.join(tmpDir, 'message.txt');
    await fs.promises.writeFile(tmpFile, message, 'utf8');
  } catch (error) {
    return {
      success: false,
      error: `Failed to create temp file: ${error.message}`
    };
  }

  try {
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
    // Clean up temp file with proper error handling
    try {
      if (tmpFile) {
        await fs.promises.unlink(tmpFile);
        // Clean up temp directory
        const tmpDir = path.dirname(tmpFile);
        await fs.promises.rmdir(tmpDir);
      }
    } catch (error) {
      log(`Failed to cleanup temp file: ${error.message}`, LOG_LEVELS.WARN);
    }
  }
}

/**
 * Branch operations
 */
async function gitBranch(action, name, cwd) {
  const workingDir = validateCwd(cwd);

  switch (action) {
    case 'list': {
      const result = await executeGitCommand(workingDir, ['branch', '-a']);
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const branches = result.stdout.split('\n')
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

      const result = await executeGitCommand(workingDir, ['checkout', '-b', name]);
      return {
        success: result.success,
        error: result.success ? null : result.stderr || result.error,
        branch: name
      };
    }

    case 'switch': {
      if (!name) {
        return { success: false, error: 'Branch name is required' };
      }
      const result = await executeGitCommand(workingDir, ['checkout', name]);
      return {
        success: result.success,
        error: result.success ? null : result.stderr || result.error,
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
        error: result.success ? null : result.stderr || result.error,
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
        error: result.success ? null : result.stderr || result.error,
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
async function gitLog(count, cwd) {
  const workingDir = validateCwd(cwd);
  const validatedCount = validateNumber(count, 'count', 1, 1000);

  const args = ['log', `-${validatedCount}`, '--oneline', '--decorate'];
  const result = await executeGitCommand(workingDir, args);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const commits = result.stdout.split('\n')
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
async function gitStash(action, cwd, index = null) {
  const workingDir = validateCwd(cwd);

  switch (action) {
    case 'save': {
      const result = await executeGitCommand(workingDir, ['stash', 'push']);
      return {
        success: result.success,
        error: result.success ? null : result.stderr || result.error,
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
        error: result.success ? null : result.stderr || result.error,
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
        error: result.success ? null : result.stderr || result.error,
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
        error: result.success ? null : result.stderr || result.error,
        summary: result.stdout
      };
    }

    case 'clear': {
      const result = await executeGitCommand(workingDir, ['stash', 'clear']);
      return {
        success: result.success,
        error: result.success ? null : result.stderr || result.error
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
        error: result.success ? null : result.stderr || result.error,
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
async function gitPush(remote = 'origin', branch = null, cwd, force = false) {
  const workingDir = validateCwd(cwd);

  // Pre-flight: check if there are commits to push
  const statusResult = await executeGitCommand(workingDir, ['status', '--short', '--branch']);
  if (!statusResult.success) {
    return { success: false, error: 'Failed to check repository status' };
  }

  const args = ['push'];
  if (force) {
    args.push('--force-with-lease');
  }
  args.push(remote);
  if (branch) {
    args.push(branch);
  }

  const result = await executeGitCommand(workingDir, args);

  return {
    success: result.success,
    error: result.success ? null : result.stderr || result.error,
    remote,
    branch,
    summary: result.stdout || result.stderr
  };
}

/**
 * Pull from remote
 */
async function gitPull(remote = 'origin', branch = null, cwd) {
  const workingDir = validateCwd(cwd);

  // Pre-flight: check for uncommitted changes
  const statusResult = await executeGitCommand(workingDir, ['status', '--porcelain']);
  if (statusResult.success && statusResult.stdout.trim()) {
    log('Warning: uncommitted changes present before pull', LOG_LEVELS.WARN);
  }

  const args = ['pull'];
  if (remote) {
    args.push(remote);
  }
  if (branch) {
    args.push(branch);
  }

  const result = await executeGitCommand(workingDir, args);

  return {
    success: result.success,
    error: result.success ? null : result.stderr || result.error,
    remote,
    branch,
    summary: result.stdout || result.stderr
  };
}

/**
 * Remote management
 */
async function gitRemote(action, name, url, cwd) {
  const workingDir = validateCwd(cwd);

  switch (action) {
    case 'list': {
      const result = await executeGitCommand(workingDir, ['remote', '-v']);
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const remotes = {};
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
          remotes[remoteName][type] = remoteUrl;
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
        error: result.success ? null : result.stderr || result.error,
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
        error: result.success ? null : result.stderr || result.error,
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
        error: result.success ? null : result.stderr || result.error,
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
async function gitReset(mode, target, cwd) {
  const workingDir = validateCwd(cwd);

  // Validate mode
  const validModes = ['soft', 'mixed', 'hard'];
  if (!validModes.includes(mode)) {
    return {
      success: false,
      error: `Invalid reset mode: ${mode}. Must be one of: ${validModes.join(', ')}`
    };
  }

  const args = ['reset'];

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
    error: result.success ? null : result.stderr || result.error,
    mode,
    target: target || 'HEAD',
    summary: result.stdout
  };
}

/**
 * Tag management
 */
async function gitTag(action, name, target, cwd, options = {}) {
  const workingDir = validateCwd(cwd);

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

      const args = ['tag'];

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
        error: result.success ? null : result.stderr || result.error,
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
        error: result.success ? null : result.stderr || result.error,
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
        error: result.success ? null : result.stderr || result.error,
        tag: name,
        remote
      };
    }

    case 'push-all': {
      const remote = options.remote || 'origin';
      const result = await executeGitCommand(workingDir, ['push', remote, '--tags']);
      return {
        success: result.success,
        error: result.success ? null : result.stderr || result.error,
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
async function gitRebase(action, target, cwd) {
  const workingDir = validateCwd(cwd);

  switch (action) {
    case 'start': {
      if (!target) {
        return { success: false, error: 'Target branch/commit is required' };
      }
      const result = await executeGitCommand(workingDir, ['rebase', target]);
      return {
        success: result.success,
        error: result.success ? null : result.stderr || result.error,
        target,
        summary: result.stdout
      };
    }

    case 'continue': {
      const result = await executeGitCommand(workingDir, ['rebase', '--continue']);
      return {
        success: result.success,
        error: result.success ? null : result.stderr || result.error,
        summary: result.stdout
      };
    }

    case 'abort': {
      const result = await executeGitCommand(workingDir, ['rebase', '--abort']);
      return {
        success: result.success,
        error: result.success ? null : result.stderr || result.error
      };
    }

    case 'skip': {
      const result = await executeGitCommand(workingDir, ['rebase', '--skip']);
      return {
        success: result.success,
        error: result.success ? null : result.stderr || result.error
      };
    }

    default:
      return { success: false, error: `Unknown action: ${action}. Supported: start, continue, abort, skip` };
  }
}

/**
 * Cherry pick commits
 */
async function gitCherryPick(commit, cwd, options = {}) {
  const workingDir = validateCwd(cwd);

  if (!commit || typeof commit !== 'string') {
    return { success: false, error: 'Commit hash is required' };
  }

  const args = ['cherry-pick'];

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
    error: result.success ? null : result.stderr || result.error,
    commit,
    summary: result.stdout
  };
}

/**
 * View line-by-line annotations
 */
async function gitBlame(file, cwd, options = {}) {
  const workingDir = validateCwd(cwd);
  const validatedFile = validateFilePath(file, workingDir);

  const args = ['blame'];

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
    error: result.success ? null : result.stderr || result.error,
    file,
    blame: result.stdout
  };
}

/**
 * View commit details
 */
async function gitShow(commit, cwd, options = {}) {
  const workingDir = validateCwd(cwd);

  if (!commit || typeof commit !== 'string') {
    return { success: false, error: 'Commit hash is required' };
  }

  const args = ['show'];

  if (options.stat) {
    args.push('--stat');
  }

  if (options.nameOnly) {
    args.push('--name-only');
  }

  if (options.file) {
    const validatedFile = validateFilePath(options.file, workingDir);
    args.push(`${commit}:${validatedFile}`);
  } else {
    args.push(commit);
  }

  const result = await executeGitCommand(workingDir, args);

  return {
    success: result.success,
    error: result.success ? null : result.stderr || result.error,
    commit,
    output: result.stdout
  };
}

// ============================================================================
// Formatting Helpers
// ============================================================================

function formatStatus(status) {
  if (!status.success) {
    return `**Git Status Error**\n\n${status.error}`;
  }

  if (status.clean) {
    return `**Clean Working Tree**\n\nBranch: \`${status.branch}\``;
  }

  const lines = [`**Git Status**\n`, `Branch: \`${status.branch}\``];

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

function formatDiff(diffResult) {
  if (!diffResult.success) {
    return `**Git Diff Error**\n\n${diffResult.error}`;
  }

  if (!diffResult.hasChanges) {
    return '**No Changes**\n\nNo differences to show.';
  }

  const lines = ['**Changes**\n', '```diff', diffResult.diff, '```'];
  return lines.join('\n');
}

function formatLog(logResult) {
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

function formatBranches(branchResult) {
  if (!branchResult.success) {
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

function formatRemotes(remoteResult) {
  if (!remoteResult.success) {
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

module.exports = function(api) {
  log('Extension loaded');

  // Register git_status tool
  api.registerTool({
    name: 'git_status',
    description: 'Check git repository status. Shows staged, unstaged, untracked, and unmerged files.',
    parameters: {
      type: 'object',
      properties: {
        cwd: {
          type: 'string',
          description: 'Working directory (defaults to current directory)'
        }
      }
    },
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      try {
        const status = await gitStatus(params?.cwd);
        const text = formatStatus(status);
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `**Git Status Failed**\n\n${error.message}` }],
          isError: true
        };
      }
    }
  });

  // Register git_diff tool
  api.registerTool({
    name: 'git_diff',
    description: 'View git differences. Can show staged or unstaged changes, or diff for a specific file.',
    parameters: {
      type: 'object',
      properties: {
        staged: {
          type: 'boolean',
          description: 'Show staged changes (default: false for unstaged)',
          default: false
        },
        file: {
          type: 'string',
          description: 'Show diff for a specific file (optional)'
        },
        stat: {
          type: 'boolean',
          description: 'Show diffstat instead of full diff',
          default: false
        },
        nameOnly: {
          type: 'boolean',
          description: 'Show only filenames changed',
          default: false
        },
        cwd: {
          type: 'string',
          description: 'Working directory'
        }
      }
    },
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      try {
        const diffResult = await gitDiff(params?.cwd, {
          staged: params?.staged || false,
          file: params?.file,
          stat: params?.stat || false,
          nameOnly: params?.nameOnly || false
        });
        const text = formatDiff(diffResult);
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `**Git Diff Failed**\n\n${error.message}` }],
          isError: true
        };
      }
    }
  });

  // Register git_add tool
  api.registerTool({
    name: 'git_add',
    description: 'Stage files for commit. Use "git add" semantics.',
    parameters: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Files to stage (can use "." for all)'
        },
        cwd: {
          type: 'string',
          description: 'Working directory'
        }
      },
      required: ['files']
    },
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      try {
        const files = params?.files;
        if (!files || files.length === 0) {
          return {
            content: [{ type: 'text', text: '**Git Add Failed**\n\nNo files specified. Use ["."] to stage all changes.' }],
            isError: true
          };
        }

        const result = await gitAdd(files, params?.cwd);

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Add Failed**\n\n${result.error}` }],
            isError: true
          };
        }

        const text = `**Files Staged**\n\nStaged ${result.staged.length} file(s):\n${result.staged.map(f => `- ${f}`).join('\n')}`;
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `**Git Add Failed**\n\n${error.message}` }],
          isError: true
        };
      }
    }
  });

  // Register git_commit tool
  api.registerTool({
    name: 'git_commit',
    description: 'Create a git commit with a conventional commit message. For complex changes, provide a body explaining what changed, why, and the impact.',
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Commit message. For simple changes: "type(scope): description". For complex changes: "type(scope): summary" followed by detailed body explaining what changed across which files, why, and the impact.'
        },
        cwd: {
          type: 'string',
          description: 'Working directory'
        }
      },
      required: ['message']
    },
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      try {
        const message = params?.message;
        if (!message || typeof message !== 'string' || message.trim() === '') {
          return {
            content: [{ type: 'text', text: '**Git Commit Failed**\n\nCommit message is required.\n\nFor simple changes:\n  "type(scope): description"\n\nFor complex changes (3+ files, non-obvious changes):\n  "type(scope): summary"\n\n  "What changed:\n  - File A: did X\n  - File B: did Y\n\n  Why: the problem this solves\n\n  Impact: behavioral or API changes"' }],
            isError: true
          };
        }

        const result = await gitCommit(message, params?.cwd);

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Commit Failed**\n\n${result.error}` }],
            isError: true
          };
        }

        const text = result.isDetailed
          ? `**Commit Created (detailed)**\n\n**Branch:** \`${result.branch}\`\n**Hash:** \`${result.hash}\`\n**Summary:** ${result.message}\n\nFull message includes body with change details.`
          : `**Commit Created**\n\n**Branch:** \`${result.branch}\`\n**Hash:** \`${result.hash}\`\n**Message:** ${result.message}`;
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `**Git Commit Failed**\n\n${error.message}` }],
          isError: true
        };
      }
    }
  });

  // Register git_branch tool
  api.registerTool({
    name: 'git_branch',
    description: 'Branch operations: list, create, switch, delete, force_delete, merge.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action: list, create, switch, delete, force_delete, merge',
          enum: ['list', 'create', 'switch', 'delete', 'force_delete', 'merge']
        },
        name: {
          type: 'string',
          description: 'Branch name (required for create, switch, delete, force_delete, merge)'
        },
        cwd: {
          type: 'string',
          description: 'Working directory'
        }
      },
      required: ['action']
    },
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      try {
        const result = await gitBranch(params?.action, params?.name, params?.cwd);

        if (!result.success) {
          const hint = result.hint ? `\n\n${result.hint}` : '';
          return {
            content: [{ type: 'text', text: `**Git Branch Failed**\n\n${result.error}${hint}` }],
            isError: true
          };
        }

        let text;
        switch (params?.action) {
          case 'list':
            text = formatBranches(result);
            break;
          case 'create':
            text = `**Branch Created**\n\nCreated and switched to branch: \`${result.branch}\``;
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

        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `**Git Branch Failed**\n\n${error.message}` }],
          isError: true
        };
      }
    }
  });

  // Register git_log tool
  api.registerTool({
    name: 'git_log',
    description: 'View commit history.',
    parameters: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Number of commits to show (default: 10)',
          default: 10
        },
        cwd: {
          type: 'string',
          description: 'Working directory'
        }
      }
    },
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      try {
        const result = await gitLog(params?.count || 10, params?.cwd);
        const text = formatLog(result);
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `**Git Log Failed**\n\n${error.message}` }],
          isError: true
        };
      }
    }
  });

  // Register git_stash tool
  api.registerTool({
    name: 'git_stash',
    description: 'Stash operations: save, list, pop, apply, drop, clear, show.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action: save, list, pop, apply, drop, clear, show',
          enum: ['save', 'list', 'pop', 'apply', 'drop', 'clear', 'show']
        },
        index: {
          type: 'number',
          description: 'Stash index (optional, defaults to latest)'
        },
        cwd: {
          type: 'string',
          description: 'Working directory'
        }
      },
      required: ['action']
    },
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      try {
        const result = await gitStash(params?.action, params?.cwd, params?.index);

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Stash Failed**\n\n${result.error}` }],
            isError: true
          };
        }

        let text;
        switch (params?.action) {
          case 'save':
            text = `**Changes Stashed**\n\n${result.summary}`;
            break;
          case 'list':
            text = `**Stash List** (${result.count})\n\n${result.stashes.join('\n')}`;
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

        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `**Git Stash Failed**\n\n${error.message}` }],
          isError: true
        };
      }
    }
  });

  // Register git_push tool
  api.registerTool({
    name: 'git_push',
    description: 'Push commits to a remote repository.',
    parameters: {
      type: 'object',
      properties: {
        remote: {
          type: 'string',
          description: 'Remote name (default: origin)',
          default: 'origin'
        },
        branch: {
          type: 'string',
          description: 'Branch name to push (optional, pushes current branch if not specified)'
        },
        force: {
          type: 'boolean',
          description: 'Force push with lease (use with caution)',
          default: false
        },
        cwd: {
          type: 'string',
          description: 'Working directory'
        }
      }
    },
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      try {
        const result = await gitPush(params?.remote, params?.branch, params?.cwd, params?.force);

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Push Failed**\n\n${result.error}` }],
            isError: true
          };
        }

        const branchInfo = result.branch ? ` branch \`${result.branch}\`` : ' current branch';
        const text = `**Pushed to Remote**\n\nPushed${branchInfo} to \`${result.remote}\`\n\n${result.summary}`;
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `**Git Push Failed**\n\n${error.message}` }],
          isError: true
        };
      }
    }
  });

  // Register git_pull tool
  api.registerTool({
    name: 'git_pull',
    description: 'Pull changes from a remote repository.',
    parameters: {
      type: 'object',
      properties: {
        remote: {
          type: 'string',
          description: 'Remote name (default: origin)',
          default: 'origin'
        },
        branch: {
          type: 'string',
          description: 'Branch name to pull (optional, pulls current branch if not specified)'
        },
        cwd: {
          type: 'string',
          description: 'Working directory'
        }
      }
    },
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      try {
        const result = await gitPull(params?.remote, params?.branch, params?.cwd);

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Pull Failed**\n\n${result.error}` }],
            isError: true
          };
        }

        const branchInfo = result.branch ? ` branch \`${result.branch}\`` : ' current branch';
        const text = `**Pulled from Remote**\n\nPulled${branchInfo} from \`${result.remote}\`\n\n${result.summary}`;
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `**Git Pull Failed**\n\n${error.message}` }],
          isError: true
        };
      }
    }
  });

  // Register git_remote tool
  api.registerTool({
    name: 'git_remote',
    description: 'Remote repository management: list, add, remove, set-url.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action: list, add, remove, set-url',
          enum: ['list', 'add', 'remove', 'set-url']
        },
        name: {
          type: 'string',
          description: 'Remote name (required for add, remove, set-url)'
        },
        url: {
          type: 'string',
          description: 'Remote URL (required for add, set-url)'
        },
        cwd: {
          type: 'string',
          description: 'Working directory'
        }
      },
      required: ['action']
    },
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      try {
        const result = await gitRemote(params?.action, params?.name, params?.url, params?.cwd);

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Remote Failed**\n\n${result.error}` }],
            isError: true
          };
        }

        let text;
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

        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `**Git Remote Failed**\n\n${error.message}` }],
          isError: true
        };
      }
    }
  });

  // Register git_reset tool
  api.registerTool({
    name: 'git_reset',
    description: 'Reset current HEAD to specified state. Modes: soft (keep changes staged), mixed (keep changes unstaged), hard (discard changes).',
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          description: 'Reset mode: soft, mixed, hard',
          enum: ['soft', 'mixed', 'hard'],
          default: 'mixed'
        },
        target: {
          type: 'string',
          description: 'Target commit (default: HEAD)',
          default: 'HEAD'
        },
        cwd: {
          type: 'string',
          description: 'Working directory'
        }
      }
    },
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      try {
        const result = await gitReset(params?.mode || 'mixed', params?.target || 'HEAD', params?.cwd);

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Reset Failed**\n\n${result.error}` }],
            isError: true
          };
        }

        const text = `**Git Reset Completed**\n\nMode: \`${result.mode}\`\nTarget: \`${result.target}\``;
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `**Git Reset Failed**\n\n${error.message}` }],
          isError: true
        };
      }
    }
  });

  // Register git_tag tool
  api.registerTool({
    name: 'git_tag',
    description: 'Tag management: list, create, delete, push, push-all.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action: list, create, delete, push, push-all',
          enum: ['list', 'create', 'delete', 'push', 'push-all']
        },
        name: {
          type: 'string',
          description: 'Tag name (required for create, delete, push)'
        },
        target: {
          type: 'string',
          description: 'Target commit (for create)'
        },
        message: {
          type: 'string',
          description: 'Tag message (for annotated tags)'
        },
        remote: {
          type: 'string',
          description: 'Remote name (for push, default: origin)',
          default: 'origin'
        },
        cwd: {
          type: 'string',
          description: 'Working directory'
        }
      },
      required: ['action']
    },
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      try {
        const options = {
          message: params?.message,
          remote: params?.remote
        };
        const result = await gitTag(params?.action, params?.name, params?.target, params?.cwd, options);

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Tag Failed**\n\n${result.error}` }],
            isError: true
          };
        }

        let text;
        switch (params?.action) {
          case 'list':
            text = `**Tags** (${result.count})\n\n${result.tags.join('\n')}`;
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

        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `**Git Tag Failed**\n\n${error.message}` }],
          isError: true
        };
      }
    }
  });

  // Register git_rebase tool
  api.registerTool({
    name: 'git_rebase',
    description: 'Rebase operations: start, continue, abort, skip.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action: start, continue, abort, skip',
          enum: ['start', 'continue', 'abort', 'skip']
        },
        target: {
          type: 'string',
          description: 'Target branch/commit (for start action)'
        },
        cwd: {
          type: 'string',
          description: 'Working directory'
        }
      },
      required: ['action']
    },
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      try {
        const result = await gitRebase(params?.action, params?.target, params?.cwd);

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Rebase Failed**\n\n${result.error}` }],
            isError: true
          };
        }

        let text;
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

        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `**Git Rebase Failed**\n\n${error.message}` }],
          isError: true
        };
      }
    }
  });

  // Register git_cherry_pick tool
  api.registerTool({
    name: 'git_cherry_pick',
    description: 'Cherry pick commits from other branches.',
    parameters: {
      type: 'object',
      properties: {
        commit: {
          type: 'string',
          description: 'Commit hash to cherry pick'
        },
        noCommit: {
          type: 'boolean',
          description: 'Stage changes without committing',
          default: false
        },
        signoff: {
          type: 'boolean',
          description: 'Add Signed-off-by line',
          default: false
        },
        cwd: {
          type: 'string',
          description: 'Working directory'
        }
      },
      required: ['commit']
    },
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      try {
        const result = await gitCherryPick(params?.commit, params?.cwd, {
          noCommit: params?.noCommit || false,
          signoff: params?.signoff || false
        });

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Cherry Pick Failed**\n\n${result.error}` }],
            isError: true
          };
        }

        const text = `**Cherry Picked**\n\nCommit: \`${result.commit}\`\n\n${result.summary}`;
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `**Git Cherry Pick Failed**\n\n${error.message}` }],
          isError: true
        };
      }
    }
  });

  // Register git_blame tool
  api.registerTool({
    name: 'git_blame',
    description: 'Show line-by-line annotation of a file.',
    parameters: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'File to blame'
        },
        lineNumbers: {
          type: 'boolean',
          description: 'Show line numbers',
          default: false
        },
        email: {
          type: 'boolean',
          description: 'Show email addresses instead of author names',
          default: false
        },
        cwd: {
          type: 'string',
          description: 'Working directory'
        }
      },
      required: ['file']
    },
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      try {
        const result = await gitBlame(params?.file, params?.cwd, {
          lineNumbers: params?.lineNumbers || false,
          email: params?.email || false
        });

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Blame Failed**\n\n${result.error}` }],
            isError: true
          };
        }

        const text = `**Blame for ${result.file}**\n\n\`\`\`\n${result.blame}\n\`\`\``;
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `**Git Blame Failed**\n\n${error.message}` }],
          isError: true
        };
      }
    }
  });

  // Register git_show tool
  api.registerTool({
    name: 'git_show',
    description: 'Show commit details.',
    parameters: {
      type: 'object',
      properties: {
        commit: {
          type: 'string',
          description: 'Commit hash or reference'
        },
        file: {
          type: 'string',
          description: 'Show specific file from commit'
        },
        stat: {
          type: 'boolean',
          description: 'Show diffstat instead of full diff',
          default: false
        },
        nameOnly: {
          type: 'boolean',
          description: 'Show only filenames changed',
          default: false
        },
        cwd: {
          type: 'string',
          description: 'Working directory'
        }
      },
      required: ['commit']
    },
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      try {
        const result = await gitShow(params?.commit, params?.cwd, {
          file: params?.file,
          stat: params?.stat || false,
          nameOnly: params?.nameOnly || false
        });

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `**Git Show Failed**\n\n${result.error}` }],
            isError: true
          };
        }

        const text = `**Commit ${result.commit}**\n\n\`\`\`\n${result.output}\n\`\`\``;
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `**Git Show Failed**\n\n${error.message}` }],
          isError: true
        };
      }
    }
  });

  log('Registered 16 git tools:');
  log('  - git_status, git_diff, git_add, git_commit');
  log('  - git_branch, git_log, git_stash');
  log('  - git_push, git_pull, git_remote');
  log('  - git_reset, git_tag, git_rebase');
  log('  - git_cherry_pick, git_blame, git_show');
};
