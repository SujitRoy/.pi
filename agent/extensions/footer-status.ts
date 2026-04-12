/**
 * PI Agent Extension: Powerline Footer (Multicolor)
 *
 * Replaces the built-in footer with a custom multicolor component using
 * setFooter(). Shows all built-in info (pwd, branch, tokens, model,
 * context %) PLUS enhanced session stats with semantic theme coloring.
 *
 * Segments (colored via Pi theme):
 * [branch] path  |  +N *M ?U -D  |  ctx:45% 58k/128k  |  model thinking:level  |
 * up-input down-output =total Rcache Wcache  |  $0.012  |  session:name  |  turns:N
 *
 * Updates dynamically on agent_end, session_compact, model_select, tool_result.
 * Thinking level is live-synced via pi.getThinkingLevel().
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  ReadonlyFooterDataProvider,
  Theme,
} from "@mariozechner/pi-coding-agent";
import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

/** Minimal Component interface (mirrors pi-tui Component) */
interface Component {
  render(width: number): string[];
  dispose?(): void;
}

/** Minimal TUI type (used only as type parameter, not accessed) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TUI = any;

// ============================================================================
// Configuration
// ============================================================================

const PATH_MODE: "full" | "abbreviated" | "basename" = "abbreviated";
const SHOW_SESSION_TOKENS = true;
const SHOW_COST = true;
const SHOW_SESSION_NAME = true;
const SHOW_TURNS = true;
const SHOW_EXTENSION_STATUSES = true;

// ============================================================================
// Shared state (updated by event handlers, read by footer render)
// ============================================================================

interface FooterState {
  cwd: string;
  branch: string | null;
  staged: number;
  modified: number;
  untracked: number;
  deleted: number;
  renamed: number;
  turns: number;
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalCost: number;
  contextPercent: number | null;
  contextTokens: number | null;
  contextWindow: number;
  provider: string;
  modelName: string;
  sessionName: string | null;
  isCompacting: boolean;
  hasData: boolean;
}

const state: FooterState = {
  cwd: process.cwd(),
  branch: null,
  staged: 0,
  modified: 0,
  untracked: 0,
  deleted: 0,
  renamed: 0,
  turns: 0,
  totalInput: 0,
  totalOutput: 0,
  totalCacheRead: 0,
  totalCacheWrite: 0,
  totalCost: 0,
  contextPercent: null,
  contextTokens: null,
  contextWindow: 0,
  provider: "",
  modelName: "no-model",
  sessionName: null,
  isCompacting: false,
  hasData: false,
};

// Theme reference (set by footer factory, used by component render)
let currentTheme: Theme | null = null;

// Footer data reference (set by footer factory)
let currentFooterData: ReadonlyFooterDataProvider | null = null;

// ============================================================================
// Git Helpers
// ============================================================================

function validateCwd(cwd: string): string {
  const resolved = path.resolve(cwd);
  try {
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      return process.cwd();
    }
  } catch {
    return process.cwd();
  }
  return resolved;
}

function getGitBranch(cwd: string): string | null {
  const dir = validateCwd(cwd);
  try {
    const branch = execSync("git branch --show-current", {
      cwd: dir,
      timeout: 2000,
      encoding: "utf8",
    }).trim();
    if (branch) return branch;
    const head = execSync("git rev-parse --short HEAD", {
      cwd: dir,
      timeout: 2000,
      encoding: "utf8",
    }).trim();
    return head ? `detached@${head}` : null;
  } catch {
    return null;
  }
}

function getWorkingTreeStats(cwd: string) {
  const dir = validateCwd(cwd);
  try {
    const output = execSync("git status --porcelain", {
      cwd: dir,
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
      if (x === "?" && y === "?") { untracked++; }
      else {
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

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

function shortenPath(p: string): string {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home && p.startsWith(home)) {
    return p === home ? "~" : `~${path.sep}${p.slice(home.length + 1)}`;
  }
  return p;
}

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

function visibleWidth(s: string): number {
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").length;
}

function truncateToWidth(s: string, maxW: number, ellipsis: string = "\u2026"): string {
  if (visibleWidth(s) <= maxW) return s;
  const raw = s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
  const ew = ellipsis.length;
  if (maxW <= ew) return ellipsis.slice(0, maxW);
  let result = "";
  let w = 0;
  for (const ch of raw) {
    if (w + 1 > maxW - ew) break;
    result += ch;
    w++;
  }
  return result + ellipsis;
}

function sanitizeStatusText(text: string): string {
  return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

// ============================================================================
// State Refresher
// ============================================================================

function refreshState(ctx: ExtensionContext) {
  state.cwd = ctx.cwd;
  state.branch = getGitBranch(ctx.cwd);
  const stats = getWorkingTreeStats(ctx.cwd);
  state.staged = stats.staged;
  state.modified = stats.modified;
  state.untracked = stats.untracked;
  state.deleted = stats.deleted;
  state.renamed = stats.renamed;

  let turns = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalCost = 0;
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "message" && entry.message.role === "assistant") {
      turns++;
      totalInput += entry.message.usage.input || 0;
      totalOutput += entry.message.usage.output || 0;
      totalCacheRead += entry.message.usage.cacheRead || 0;
      totalCacheWrite += entry.message.usage.cacheWrite || 0;
      totalCost += entry.message.usage.cost?.total || 0;
    }
  }
  state.turns = turns;
  state.totalInput = totalInput;
  state.totalOutput = totalOutput;
  state.totalCacheRead = totalCacheRead;
  state.totalCacheWrite = totalCacheWrite;
  state.totalCost = totalCost;

  const usage = ctx.getContextUsage();
  state.contextPercent = usage?.percent ?? null;
  state.contextTokens = usage?.tokens ?? null;
  state.contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;

  state.provider = (ctx.model as any)?.provider ?? "";
  state.modelName = ctx.model?.id || "no-model";

  state.sessionName = SHOW_SESSION_NAME ? (ctx.sessionManager.getSessionName() ?? null) : null;
  state.hasData = true;
}

// ============================================================================
// Footer Component
// ============================================================================

function createFooterComponent(): Component {
  return {
    render(width: number): string[] {
      if (!state.hasData || !currentTheme) return [];

      const t = currentTheme;
      const dim = (s: string) => t.fg("dim", s);
      const accent = (s: string) => t.fg("accent", s);
      const muted = (s: string) => t.fg("muted", s);
      const success = (s: string) => t.fg("success", s);
      const warn = (s: string) => t.fg("warning", s);
      const err = (s: string) => t.fg("error", s);

      const SEP = dim(" \u2502 "); // │

      // Build segments
      const segs: string[] = [];

      // 1. [branch] path
      const fp = formatPath(state.cwd);
      if (state.branch) {
        segs.push(`${accent(`[${state.branch}]`)} ${dim(fp)}`);
      } else {
        segs.push(dim(fp));
      }

      // 2. Git stats
      const gp: string[] = [];
      if (state.staged > 0) gp.push(success(`+${state.staged}`));
      if (state.modified > 0) gp.push(warn(`*${state.modified}`));
      if (state.untracked > 0) gp.push(muted(`?${state.untracked}`));
      if (state.deleted > 0) gp.push(err(`-${state.deleted}`));
      if (state.renamed > 0) gp.push(accent(`R${state.renamed}`));
      segs.push(gp.length > 0 ? gp.join(" ") : success("clean"));

      // 3. Context usage
      if (state.contextPercent !== null) {
        const pct = state.contextPercent;
        const pctCol = pct > 80 ? err : pct > 60 ? warn : muted;
        const tokStr = state.contextTokens !== null
          ? ` ${formatTokens(state.contextTokens)}/${formatTokens(state.contextWindow)}`
          : "";
        const w2 = pct > 80 ? err("!!") : pct > 60 ? warn("!") : "";
        segs.push(`${pctCol(`ctx:${pct.toFixed(1)}%`)}${dim(tokStr)}${w2}`);
      } else {
        segs.push(muted(`ctx:?/${formatTokens(state.contextWindow)}`));
      }

      // 4. Model (provider) name
      if (state.provider) {
        segs.push(`${muted(state.provider)} ${accent(state.modelName)}`);
      } else {
        segs.push(accent(state.modelName));
      }

      // 5. Session tokens
      if (SHOW_SESSION_TOKENS && (state.totalInput || state.totalOutput)) {
        const tp: string[] = [];
        if (state.totalInput) tp.push(`\u2191${formatTokens(state.totalInput)}`);
        if (state.totalOutput) tp.push(`\u2193${formatTokens(state.totalOutput)}`);
        if (state.totalInput + state.totalOutput) tp.push(`=${formatTokens(state.totalInput + state.totalOutput)}`);
        if (state.totalCacheRead) tp.push(`R${formatTokens(state.totalCacheRead)}`);
        if (state.totalCacheWrite) tp.push(`W${formatTokens(state.totalCacheWrite)}`);
        segs.push(muted(tp.join(" ")));
      }

      // 6. Cost
      if (SHOW_COST && state.totalCost > 0) {
        segs.push(accent(`$${state.totalCost.toFixed(3)}`));
      }

      // 7. Session name
      if (state.sessionName) {
        segs.push(muted(`session:${state.sessionName}`));
      }

      // 8. Turns
      if (SHOW_TURNS && state.turns > 0) {
        segs.push(muted(`turns:${state.turns}`));
      }

      // 9. Compaction
      if (state.isCompacting) {
        segs.push(warn("compacting..."));
      }

      // Join with separators
      let line = segs.join(SEP);

      // Truncate if too wide
      if (visibleWidth(line) > width) {
        line = truncateToWidth(line, width);
      }

      const lines: string[] = [line];

      // Extension statuses (from setStatus calls by other extensions)
      if (SHOW_EXTENSION_STATUSES && currentFooterData) {
        const extStatuses = currentFooterData.getExtensionStatuses();
        if (extStatuses.size > 0) {
          const entries = Array.from(extStatuses.entries()) as [string, string][];
          const sorted = entries
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([, text]) => sanitizeStatusText(text));
          const extLine = sorted.join(" ");
          lines.push(truncateToWidth(dim(extLine), width));
        }
      }

      return lines;
    },

    dispose() {
      currentTheme = null;
      currentFooterData = null;
    },
  };
}

// ============================================================================
// Extension Entry Point
// ============================================================================

export default async function (pi: ExtensionAPI): Promise<void> {
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  function debouncedRefresh(ctx: ExtensionContext) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refreshState(ctx);
    }, 300);
  }

  function setupFooter(ctx: ExtensionContext) {
    refreshState(ctx);
    (ctx.ui as any).setFooter(
      (_tui: unknown, theme: Theme, footerData: ReadonlyFooterDataProvider) => {
        currentTheme = theme;
        currentFooterData = footerData;
        return createFooterComponent();
      },
    );
  }

  /**
   * Restore the built-in footer on shutdown
   */
  function restoreFooter(ctx: ExtensionContext) {
    (ctx.ui as any).setFooter(undefined);
    currentTheme = null;
    currentFooterData = null;
  }

  pi.on("session_start", async (_event: any, ctx: ExtensionContext) => {
    refreshState(ctx);
    setupFooter(ctx);
  });

  pi.on("agent_end", async (_event: any, ctx: ExtensionContext) => {
    debouncedRefresh(ctx);
  });

  pi.on("session_compact", async (_event: any, ctx: ExtensionContext) => {
    state.isCompacting = true;
    refreshState(ctx);
    setTimeout(() => {
      state.isCompacting = false;
      refreshState(ctx);
    }, 3000);
  });

  pi.on("tool_result", async (event: any, ctx: ExtensionContext) => {
    const tn = event.toolName;
    if (tn === "edit" || tn === "write_file" || tn === "bash") {
      debouncedRefresh(ctx);
    }
  });

  pi.on("model_select", async (_event: any, ctx: ExtensionContext) => {
    refreshState(ctx);
  });

  pi.on("session_shutdown", async (_event: any, ctx: ExtensionContext) => {
    restoreFooter(ctx);
  });

  pi.on("agent_start", async (_event: any, ctx: ExtensionContext) => {
    if (!state.hasData) {
      refreshState(ctx);
      setupFooter(ctx);
    }
  });
}
