#!/usr/bin/env node

/**
 * PI Agent Extension: Git Tools
 *
 * Provides direct git operations as callable tools for the PI agent.
 * Enables committing, branching, staging, and other git operations without
 * requiring manual shell commands.
 *
 * Tools Provided:
 * - git_status({ cwd }) - Check repository status
 * - git_diff({ cwd, staged, file }) - View changes
 * - git_add({ files, cwd }) - Stage files
 * - git_commit({ message, cwd }) - Create commit
 * - git_branch({ action, name, cwd }) - Branch operations
 * - git_log({ count, cwd }) - View commit history
 * - git_stash({ action, cwd }) - Stash operations
 * - git_push({ remote, branch, cwd }) - Push to remote
 * - git_pull({ remote, branch, cwd }) - Pull from remote
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
// Git Command Executor
// ============================================================================

/**
 * Execute a git command with error handling
 */
async function executeGitCommand(cwd, args, options = {}) {
  const {
    timeout = 30000,
    maxBuffer = 10 * 1024 * 1024 // 10MB
  } = options;

  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd: cwd || process.cwd(),
      timeout,
      maxBuffer,
      env: { ...process.env }
    });

    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stdout: error.stdout?.trim() || '',
      stderr: error.stderr?.trim() || '',
      exitCode: error.code
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
  const result = await executeGitCommand(cwd, ['status', '--short', '--branch']);
  
  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Parse status output
  const lines = result.stdout.split('\n').filter(line => line.trim());
  const branchLine = lines[0] || '';
  const branchMatch = branchLine.match(/## (.+?)(?:\.\.\.(.+))?$/);
  
  const status = {
    success: true,
    branch: branchMatch ? branchMatch[1] : 'unknown',
    upstream: branchMatch ? branchMatch[2] : null,
    staged: [],
    unstaged: [],
    untracked: [],
    clean: result.stdout.trim() === '' || (lines.length === 1 && lines[0].startsWith('##'))
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const statusCode = line.substring(0, 2);
    const filePath = line.substring(3).trim();

    if (statusCode === '??') {
      status.untracked.push(filePath);
    } else if (statusCode.includes('M') || statusCode.includes('A') || statusCode.includes('D') || statusCode.includes('R')) {
      if (statusCode[0] !== ' ' && statusCode[0] !== '?') {
        status.staged.push({ file: filePath, status: statusCode[0] });
      }
      if (statusCode[1] !== ' ' && statusCode[1] !== '?') {
        status.unstaged.push({ file: filePath, status: statusCode[1] });
      }
    }
  }

  return status;
}

/**
 * Get git diff
 */
async function gitDiff(cwd, options = {}) {
  const {
    staged = false,
    file = null
  } = options;

  const args = ['diff', '--no-color'];
  if (staged) {
    args.push('--cached');
  }
  if (file) {
    args.push('--', file);
  }

  const result = await executeGitCommand(cwd, args);
  
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

  const args = ['add', ...files];
  const result = await executeGitCommand(cwd, args);
  
  return {
    success: result.success,
    error: result.success ? null : result.error,
    staged: files
  };
}

/**
 * Create a commit
 */
async function gitCommit(message, cwd) {
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return { success: false, error: 'Commit message is required' };
  }

  // Check if there's anything staged
  const statusResult = await executeGitCommand(cwd, ['diff', '--cached', '--quiet']);
  if (statusResult.success) {
    // Exit code 0 means no staged changes
    return { 
      success: false, 
      error: 'No staged changes to commit. Use git_add first.' 
    };
  }

  // Write message to temp file for multi-line support
  const tmpFile = path.join(os.tmpdir(), `git-commit-msg-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, message, 'utf8');

  const args = ['commit', '-F', tmpFile];
  const result = await executeGitCommand(cwd, args);

  // Clean up temp file
  try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
  
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
}

/**
 * Branch operations
 */
async function gitBranch(action, name, cwd) {
  switch (action) {
    case 'list': {
      const result = await executeGitCommand(cwd, ['branch', '-a']);
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
      const result = await executeGitCommand(cwd, ['checkout', '-b', name]);
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
      const result = await executeGitCommand(cwd, ['checkout', name]);
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
      const result = await executeGitCommand(cwd, ['branch', '-d', name]);
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
      const result = await executeGitCommand(cwd, ['merge', name]);
      return {
        success: result.success,
        error: result.success ? null : result.stderr || result.error,
        branch: name,
        summary: result.stdout
      };
    }

    default:
      return { success: false, error: `Unknown action: ${action}. Supported: list, create, switch, delete, merge` };
  }
}

/**
 * View commit log
 */
async function gitLog(count = 10, cwd) {
  const args = ['log', `-${count}`, '--oneline', '--decorate'];
  const result = await executeGitCommand(cwd, args);
  
  if (!result.success) {
    return { success: false, error: result.error };
  }

  const commits = result.stdout.split('\n')
    .filter(line => line.trim())
    .map(line => {
      const match = line.match(/^([a-f0-9]+)\s+(.+?)\s+(.+)$/);
      return match
        ? { hash: match[1], refs: match[2], message: match[3] }
        : { hash: line.substring(0, 7), message: line };
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
async function gitStash(action, cwd) {
  switch (action) {
    case 'save': {
      const result = await executeGitCommand(cwd, ['stash', 'push']);
      return {
        success: result.success,
        error: result.success ? null : result.stderr || result.error,
        summary: result.stdout
      };
    }

    case 'list': {
      const result = await executeGitCommand(cwd, ['stash', 'list']);
      if (!result.success) {
        return { success: false, error: result.error };
      }
      const stashes = result.stdout.split('\n').filter(line => line.trim());
      return { success: true, stashes, count: stashes.length };
    }

    case 'pop': {
      const result = await executeGitCommand(cwd, ['stash', 'pop']);
      return {
        success: result.success,
        error: result.success ? null : result.stderr || result.error,
        summary: result.stdout
      };
    }

    case 'apply': {
      const result = await executeGitCommand(cwd, ['stash', 'apply']);
      return {
        success: result.success,
        error: result.success ? null : result.stderr || result.error,
        summary: result.stdout
      };
    }

    case 'clear': {
      const result = await executeGitCommand(cwd, ['stash', 'clear']);
      return {
        success: result.success,
        error: result.success ? null : result.stderr || result.error
      };
    }

    default:
      return { success: false, error: `Unknown action: ${action}. Supported: save, list, pop, apply, clear` };
  }
}

/**
 * Push to remote
 */
async function gitPush(remote = 'origin', branch = null, cwd, force = false) {
  const args = ['push'];
  if (force) {
    args.push('--force-with-lease');
  }
  args.push(remote);
  if (branch) {
    args.push(branch);
  }

  const result = await executeGitCommand(cwd, args);
  
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
  const args = ['pull'];
  if (remote) {
    args.push(remote);
  }
  if (branch) {
    args.push(branch);
  }

  const result = await executeGitCommand(cwd, args);
  
  return {
    success: result.success,
    error: result.success ? null : result.stderr || result.error,
    remote,
    branch,
    summary: result.stdout || result.stderr
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

  if (status.staged.length > 0) {
    lines.push(`\n**Staged Changes (${status.staged.length}):**`);
    status.staged.forEach(f => {
      const icon = f.status === 'M' ? '[M]' : f.status === 'A' ? '[A]' : f.status === 'D' ? '[D]' : '[R]';
      lines.push(`  ${icon} ${f.file}`);
    });
  }

  if (status.unstaged.length > 0) {
    lines.push(`\n**Unstaged Changes (${status.unstaged.length}):**`);
    status.unstaged.forEach(f => {
      const icon = f.status === 'M' ? '[M]' : f.status === 'D' ? '[D]' : '[R]';
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
    lines.push(`${i + 1}. \`${commit.hash.substring(0, 7)}\` - ${commit.message}`);
  });

  return lines.join('\n');
}

function formatBranches(branchResult) {
  if (!branchResult.success) {
    return `**Git Branch Error**\n\n${branchResult.error}`;
  }

  const lines = ['**Branches**\n'];
  branchResult.branches.forEach(branch => {
    const icon = branch.current ? '->' : branch.remote ? '[remote]' : '[local]';
    lines.push(`${icon} ${branch.name}`);
  });

  return lines.join('\n');
}

// ============================================================================
// PI Agent Extension Factory
// ============================================================================

module.exports = function(api) {
  console.log('[git-tools] Extension loaded');

  // Register git_status tool
  api.registerTool({
    name: 'git_status',
    description: 'Check git repository status. Shows staged, unstaged, and untracked files.',
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
          file: params?.file
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

        const text = `**Files Staged**\n\nStaged ${files.length} file(s):\n${files.map(f => `- ${f}`).join('\n')}`;
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
    description: 'Branch operations: list, create, switch, delete, merge.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action: list, create, switch, delete, merge',
          enum: ['list', 'create', 'switch', 'delete', 'merge']
        },
        name: {
          type: 'string',
          description: 'Branch name (required for create, switch, delete, merge)'
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
          return {
            content: [{ type: 'text', text: `**Git Branch Failed**\n\n${result.error}` }],
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
            text = `**Branch Deleted**\n\nDeleted branch: \`${result.branch}\``;
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
    description: 'Stash operations: save, list, pop, apply, clear.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action: save, list, pop, apply, clear',
          enum: ['save', 'list', 'pop', 'apply', 'clear']
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
        const result = await gitStash(params?.action, params?.cwd);

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
          case 'clear':
            text = `**Stash Cleared**\n\nAll stashes removed.`;
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

  console.log('[git-tools] Registered 9 git tools:');
  console.log('  - git_status, git_diff, git_add, git_commit');
  console.log('  - git_branch, git_log, git_stash');
  console.log('  - git_push, git_pull');
};
