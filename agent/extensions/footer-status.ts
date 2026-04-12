/**
 * PI Agent Extension: Footer Status
 *
 * Displays dynamic status information in the Pi CLI footer via setStatus().
 * The built-in footer renders extension statuses on a dedicated line below
 * the main stats (pwd, branch, tokens, model).
 *
 * Shows:
 * - Current git branch
 * - Working directory (with ~ for home)
 * - Modified and untracked file counts
 * - Session name
 * - Context usage percentage
 * - Auto-compact status
 *
 * Updates dynamically on agent_end, session_compact, and tool_result events.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

/**
 * Get the current git branch
 */
function getGitBranch(cwd: string): string | null {
  try {
    const branch = execSync("git branch --show-current", {
      cwd,
      timeout: 3000,
      encoding: "utf8",
    }).trim();
    if (branch) return branch;

    // Check for detached HEAD
    const head = execSync("git rev-parse --short HEAD", {
      cwd,
      timeout: 3000,
      encoding: "utf8",
    }).trim();
    return head ? `detached@${head}` : null;
  } catch {
    return null;
  }
}

/**
 * Count modified and untracked files in the working directory
 */
function getWorkingTreeStats(cwd: string): {
  modified: number;
  untracked: number;
  staged: number;
  deleted: number;
} {
  try {
    const output = execSync("git status --porcelain", {
      cwd,
      timeout: 3000,
      encoding: "utf8",
    });

    const lines = output.split("\n").filter((l) => l.trim());
    let modified = 0;
    let untracked = 0;
    let staged = 0;
    let deleted = 0;

    for (const line of lines) {
      const indexStatus = line[0];
      const worktreeStatus = line[1];

      if (indexStatus === "?" && worktreeStatus === "?") {
        untracked++;
      } else {
        if (indexStatus === "M" || indexStatus === "A" || indexStatus === "R" || indexStatus === "C") {
          staged++;
        }
        if (worktreeStatus === "M" || worktreeStatus === "D") {
          modified++;
        }
        if (worktreeStatus === "D" && indexStatus === "D") {
          deleted++;
        }
        // Count unstaged modifications
        if (worktreeStatus === "M" && indexStatus !== "M" && indexStatus !== "A") {
          // already counted above
        }
        // Count modified in working tree (including staged changes)
        if (indexStatus === "M" || worktreeStatus === "M") {
          modified++;
          // Deduplicate if both index and worktree are modified
          if (indexStatus === "M" && worktreeStatus === "M") {
            modified--;
          }
        }
      }
    }

    // Recount with simpler logic
    modified = 0;
    untracked = 0;
    staged = 0;
    deleted = 0;

    for (const line of lines) {
      const xy = line.substring(0, 2);
      if (xy === "??") {
        untracked++;
      } else {
        const [x, y] = [xy[0], xy[1]];
        if (x !== " " && x !== "?") staged++;
        if (y !== " " && y !== "?") {
          if (y === "M") modified++;
          if (y === "D") deleted++;
        }
        if (x === "M" || x === "A" || x === "R") {
          // staged change - count as modified too
          if (y !== "M") modified++;
        }
      }
    }

    return { modified, untracked, staged, deleted };
  } catch {
    return { modified: 0, untracked: 0, staged: 0, deleted: 0 };
  }
}

/**
 * Shorten a path by replacing home directory with ~
 */
function shortenPath(p: string): string {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home && p.startsWith(home)) {
    return p === home ? "~" : `~${path.sep}${p.slice(home.length + 1)}`;
  }
  return p;
}

/**
 * Format the status text for display
 */
function formatStatus(
  cwd: string,
  branch: string | null,
  stats: { modified: number; untracked: number; staged: number; deleted: number },
  sessionName: string | null,
  contextPercent: number | null,
  isCompacting: boolean,
): string {
  const parts: string[] = [];

  // Working directory + branch
  const shortPath = shortenPath(cwd);
  if (branch) {
    parts.push(`[${branch}] ${shortPath}`);
  } else {
    parts.push(shortPath);
  }

  // File change stats
  const changeParts: string[] = [];
  if (stats.staged > 0) changeParts.push(`staged:${stats.staged}`);
  if (stats.modified > 0) changeParts.push(`modified:${stats.modified}`);
  if (stats.untracked > 0) changeParts.push(`untracked:${stats.untracked}`);
  if (stats.deleted > 0) changeParts.push(`deleted:${stats.deleted}`);

  if (changeParts.length > 0) {
    parts.push(changeParts.join(" "));
  } else {
    parts.push("clean");
  }

  // Context usage
  if (contextPercent !== null) {
    const color = contextPercent > 80 ? "!!" : contextPercent > 60 ? "!" : "";
    parts.push(`ctx:${contextPercent.toFixed(1)}%${color}`);
  }

  // Session name
  if (sessionName) {
    parts.push(`session:${sessionName}`);
  }

  // Compaction status
  if (isCompacting) {
    parts.push("compacting...");
  }

  return parts.join(" | ");
}

export default async function (pi: ExtensionAPI): Promise<void> {
  const STATUS_KEY = "footer-status";

  // State tracking
  let contextPercent: number | null = null;
  let isCompacting = false;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let branchUnsubscribe: (() => void) | null = null;

  /**
   * Refresh and update the footer status
   */
  async function refreshStatus(ctx: import("@mariozechner/pi-coding-agent").ExtensionContext) {
    try {
      const cwd = ctx.cwd;
      const branch = getGitBranch(cwd);
      const stats = getWorkingTreeStats(cwd);
      const sessionName = ctx.sessionManager.getSessionName() ?? null;

      // Get context usage
      const usage = ctx.getContextUsage();
      contextPercent = usage?.percent ?? null;

      const statusText = formatStatus(
        cwd,
        branch,
        stats,
        sessionName,
        contextPercent,
        isCompacting,
      );

      ctx.ui.setStatus(STATUS_KEY, statusText);
    } catch {
      // Silently ignore errors (e.g., during shutdown)
    }
  }

  /**
   * Debounced refresh to avoid excessive updates
   */
  function debouncedRefresh(ctx: import("@mariozechner/pi-coding-agent").ExtensionContext) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void refreshStatus(ctx);
    }, 500);
  }

  /**
   * Listen for context changes (session switch, etc.)
   */
  pi.on("session_start", async (_event, ctx) => {
    await refreshStatus(ctx);
  });

  /**
   * Update after agent completes a turn (files may have changed)
   */
  pi.on("agent_end", async (_event, ctx) => {
    debouncedRefresh(ctx);
  });

  /**
   * Update when session compacts (context % changes)
   */
  pi.on("session_compact", async (_event, ctx) => {
    isCompacting = true;
    await refreshStatus(ctx);
    // Reset compacting flag after a short delay
    setTimeout(() => {
      isCompacting = false;
      void refreshStatus(ctx);
    }, 2000);
  });

  /**
   * Update when edit/write tools are used (file state changes)
   */
  pi.on("tool_result", async (event, ctx) => {
    const toolName = event.toolName;
    // Refresh for file-modifying tools
    if (toolName === "edit" || toolName === "write_file" || toolName === "bash") {
      debouncedRefresh(ctx);
    }
  });

  /**
   * Initial status set on extension load
   */
  pi.on("agent_start", async (_event, ctx) => {
    // Only set initial status once (check if not already set)
    if (!refreshTimer) {
      await refreshStatus(ctx);
    }
  });
}
