/**
 * PI Agent Extension: Footer Status (Enhanced)
 *
 * Displays rich status information in the Pi CLI footer via setStatus().
 * The built-in footer renders extension statuses on a dedicated line below
 * the main stats (pwd, branch, tokens, model, context %).
 *
 * Shows:
 * - Hostname (user@host)
 * - Current time (HH:MM)
 * - Current git branch (with detached HEAD support)
 * - Working directory (with ~ shorthand)
 * - Git file stats: staged (+N), modified (*N), untracked (?N), deleted (-N)
 * - Context usage: ctx:45.5% 58k/128k
 * - Model name + thinking level
 * - Session name + session ID
 * - Turn count
 * - Cumulative tokens: ↑input ↓output =total Rcache Wcache
 * - Cumulative cost ($N.NNN)
 * - Compaction indicator
 *
 * Updates dynamically on agent_end, session_compact, and tool_result events.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { execSync } from "child_process";
import * as path from "path";

// ============================================================================
// Configuration
// ============================================================================

/** Separator character between segments. Use powerline chars if your font supports them: \uE0B1 \uE0B3 \u2022 */
const SEP = " | ";

/** Path display mode: "full" | "abbreviated" | "basename" */
const PATH_MODE: "full" | "abbreviated" | "basename" = "abbreviated";

/** Include cumulative token stats in footer (default footer shows per-turn, this shows session total) */
const SHOW_TOKENS = true;

/** Include cost in footer */
const SHOW_COST = true;

/** Include hostname */
const SHOW_HOSTNAME = false;

/** Include current time */
const SHOW_TIME = false;

/** Include session ID */
const SHOW_SESSION_ID = false;

// ============================================================================
// Git Helpers
// ============================================================================

/**
 * Get the current git branch
 */
function getGitBranch(cwd: string): string | null {
  try {
    const branch = execSync("git branch --show-current", {
      cwd,
      timeout: 2000,
      encoding: "utf8",
    }).trim();
    if (branch) return branch;

    // Check for detached HEAD
    const head = execSync("git rev-parse --short HEAD", {
      cwd,
      timeout: 2000,
      encoding: "utf8",
    }).trim();
    return head ? `detached@${head}` : null;
  } catch {
    return null;
  }
}

/**
 * Count file changes in the working directory
 */
function getWorkingTreeStats(cwd: string): {
  staged: number;
  modified: number;
  untracked: number;
  deleted: number;
  renamed: number;
} {
  try {
    const output = execSync("git status --porcelain", {
      cwd,
      timeout: 2000,
      encoding: "utf8",
    });

    const lines = output.split("\n").filter((l: string) => l.trim());
    let staged = 0;
    let modified = 0;
    let untracked = 0;
    let deleted = 0;
    let renamed = 0;

    for (const line of lines) {
      if (line.length < 3) continue;
      const x = line[0];
      const y = line[1];

      if (x === "?" && y === "?") {
        untracked++;
      } else {
        if (x !== " ") staged++;
        if (y === "M") modified++;
        if (y === "D") deleted++;
        if (x === "R" || y === "R") renamed++;
      }
    }

    return { staged, modified, untracked, deleted, renamed };
  } catch {
    return { staged: 0, modified: 0, untracked: 0, deleted: 0, renamed: 0 };
  }
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format token counts like the built-in footer (1.2k, 45M, etc.)
 */
function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
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
 * Format path according to PATH_MODE
 */
function formatPath(p: string): string {
  const short = shortenPath(p);
  if (PATH_MODE === "basename") return path.basename(short);
  if (PATH_MODE === "abbreviated") {
    const parts = short.split(path.sep);
    if (parts.length <= 3) return short;
    const last = parts[parts.length - 1];
    const second = parts[parts.length - 2];
    return `~/${parts[0] === "~" ? "" : parts[0] + "/"}.../${second}/${last}`;
  }
  return short;
}

/**
 * Get hostname
 */
function getHostname(): string {
  try {
    const host = execSync("hostname -s", { timeout: 1000, encoding: "utf8" }).trim();
    const user = process.env.USER || process.env.USERNAME || "user";
    return `${user}@${host}`;
  } catch {
    return "unknown";
  }
}

/**
 * Get current time as HH:MM
 */
function getTime(): string {
  const now = new Date();
  return now.toTimeString().slice(0, 5);
}

// ============================================================================
// Session Stats
// ============================================================================

/**
 * Compute cumulative session stats from entries
 */
function getSessionStats(ctx: ExtensionContext): {
  turns: number;
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalCost: number;
  modelName: string;
  thinkingLevel: string;
} {
  let turns = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalCost = 0;

  // Count turns and cumulative usage from session entries
  const entries = ctx.sessionManager.getEntries();
  for (const entry of entries) {
    if (entry.type === "message" && entry.message.role === "assistant") {
      turns++;
      totalInput += entry.message.usage.input || 0;
      totalOutput += entry.message.usage.output || 0;
      totalCacheRead += entry.message.usage.cacheRead || 0;
      totalCacheWrite += entry.message.usage.cacheWrite || 0;
      totalCost += entry.message.usage.cost?.total || 0;
    }
  }

  // Model info
  const model = ctx.model;
  const modelName = model?.id || "no-model";

  // Thinking level - check if model supports reasoning
  const thinkingLevel = (model as any)?.reasoning
    ? ((ctx as any).state?.thinkingLevel || "off")
    : "n/a";

  return {
    turns,
    totalInput,
    totalOutput,
    totalCacheRead,
    totalCacheWrite,
    totalCost,
    modelName,
    thinkingLevel,
  };
}

// ============================================================================
// Status Formatting
// ============================================================================

/**
 * Format the complete status text
 */
function formatStatus(
  ctx: ExtensionContext,
  branch: string | null,
  stats: { staged: number; modified: number; untracked: number; deleted: number; renamed: number },
  sessionStats: {
    turns: number;
    totalInput: number;
    totalOutput: number;
    totalCacheRead: number;
    totalCacheWrite: number;
    totalCost: number;
    modelName: string;
    thinkingLevel: string;
  },
  contextPercent: number | null,
  contextTokens: number | null,
  contextWindow: number,
  isCompacting: boolean,
): string {
  const parts: string[] = [];

  // Hostname (optional)
  if (SHOW_HOSTNAME) {
    parts.push(getHostname());
  }

  // Time (optional)
  if (SHOW_TIME) {
    parts.push(getTime());
  }

  // Path + branch
  const formattedPath = formatPath(ctx.cwd);
  if (branch) {
    parts.push(`[${branch}] ${formattedPath}`);
  } else {
    parts.push(formattedPath);
  }

  // Git file stats (powerline-style icons)
  const gitParts: string[] = [];
  if (stats.staged > 0) gitParts.push(`+${stats.staged}`);
  if (stats.modified > 0) gitParts.push(`*${stats.modified}`);
  if (stats.untracked > 0) gitParts.push(`?${stats.untracked}`);
  if (stats.deleted > 0) gitParts.push(`-${stats.deleted}`);
  if (stats.renamed > 0) gitParts.push(`R${stats.renamed}`);

  if (gitParts.length > 0) {
    parts.push(gitParts.join(" "));
  } else {
    parts.push("clean");
  }

  // Context usage: ctx:45.5% 58k/128k
  if (contextPercent !== null) {
    const pctStr = contextPercent.toFixed(1);
    const tokStr = contextTokens !== null ? ` ${formatTokens(contextTokens)}/${formatTokens(contextWindow)}` : "";
    const warn = contextPercent > 80 ? "!!" : contextPercent > 60 ? "!" : "";
    parts.push(`ctx:${pctStr}%${tokStr}${warn}`);
  } else {
    parts.push(`ctx:?/${formatTokens(contextWindow)}`);
  }

  // Model + thinking level
  if (sessionStats.thinkingLevel !== "n/a") {
    const think = sessionStats.thinkingLevel === "off"
      ? "thinking:off"
      : sessionStats.thinkingLevel === "high" || sessionStats.thinkingLevel === "xhigh"
        ? `thinking:${sessionStats.thinkingLevel}`
        : `thinking:${sessionStats.thinkingLevel}`;
    parts.push(`${sessionStats.modelName} ${think}`);
  } else {
    parts.push(sessionStats.modelName);
  }

  // Token stats (cumulative session total)
  if (SHOW_TOKENS && sessionStats.totalInput + sessionStats.totalOutput > 0) {
    const t = sessionStats;
    const tokenParts: string[] = [];
    if (t.totalInput) tokenParts.push(`\u2191${formatTokens(t.totalInput)}`);
    if (t.totalOutput) tokenParts.push(`\u2193${formatTokens(t.totalOutput)}`);
    if (t.totalInput + t.totalOutput) tokenParts.push(`=${formatTokens(t.totalInput + t.totalOutput)}`);
    if (t.totalCacheRead) tokenParts.push(`R${formatTokens(t.totalCacheRead)}`);
    if (t.totalCacheWrite) tokenParts.push(`W${formatTokens(t.totalCacheWrite)}`);
    if (tokenParts.length > 0) {
      parts.push(tokenParts.join(" "));
    }
  }

  // Cost
  if (SHOW_COST && sessionStats.totalCost > 0) {
    parts.push(`$${sessionStats.totalCost.toFixed(3)}`);
  }

  // Session name
  const sessionName = ctx.sessionManager.getSessionName();
  if (sessionName) {
    parts.push(`session:${sessionName}`);
  }

  // Session ID (optional)
  if (SHOW_SESSION_ID) {
    const leafId = ctx.sessionManager.getLeafId?.();
    if (leafId) {
      parts.push(`id:${leafId.slice(0, 8)}`);
    }
  }

  // Turn count
  if (sessionStats.turns > 0) {
    parts.push(`turns:${sessionStats.turns}`);
  }

  // Compaction indicator
  if (isCompacting) {
    parts.push("compacting...");
  }

  return parts.join(SEP);
}

// ============================================================================
// Extension Entry Point
// ============================================================================

export default async function (pi: ExtensionAPI): Promise<void> {
  const STATUS_KEY = "footer-status";

  // State tracking
  let isCompacting = false;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let initialSet = false;

  /**
   * Refresh and update the footer status
   */
  async function refreshStatus(ctx: ExtensionContext) {
    try {
      const cwd = ctx.cwd;
      const branch = getGitBranch(cwd);
      const fileStats = getWorkingTreeStats(cwd);
      const sessionStats = getSessionStats(ctx);
      const contextUsage = ctx.getContextUsage();
      const contextPercent = contextUsage?.percent ?? null;
      const contextTokens = contextUsage?.tokens ?? null;
      const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;

      const statusText = formatStatus(
        ctx,
        branch,
        fileStats,
        sessionStats,
        contextPercent,
        contextTokens,
        contextWindow,
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
  function debouncedRefresh(ctx: ExtensionContext) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void refreshStatus(ctx);
    }, 500);
  }

  /**
   * Session start or switch
   */
  pi.on("session_start", async (_event: any, ctx: ExtensionContext) => {
    initialSet = false;
    await refreshStatus(ctx);
  });

  /**
   * Agent finished a turn -- files and context may have changed
   */
  pi.on("agent_end", async (_event: any, ctx: ExtensionContext) => {
    debouncedRefresh(ctx);
  });

  /**
   * Session compaction -- context % changes
   */
  pi.on("session_compact", async (_event: any, ctx: ExtensionContext) => {
    isCompacting = true;
    await refreshStatus(ctx);
    setTimeout(() => {
      isCompacting = false;
      void refreshStatus(ctx);
    }, 3000);
  });

  /**
   * Tool results -- refresh when file-modifying tools run
   */
  pi.on("tool_result", async (event: any, ctx: ExtensionContext) => {
    const toolName = event.toolName;
    if (toolName === "edit" || toolName === "write_file" || toolName === "bash") {
      debouncedRefresh(ctx);
    }
  });

  /**
   * Initial status set when agent starts
   */
  pi.on("agent_start", async (_event: any, ctx: ExtensionContext) => {
    if (!initialSet) {
      initialSet = true;
      await refreshStatus(ctx);
    }
  });
}
