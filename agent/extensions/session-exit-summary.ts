/**
 * PI Agent Extension: Session Exit Summary (IMPROVED)
 *
 * Displays a rich summary of the session when the user exits (Ctrl+C).
 * Shows in a structured, readable format:
 * - Session ID and name (validated from multiple sources)
 * - Working directory
 * - Model used (provider + model ID)
 * - Complete message statistics (all roles)
 * - Token usage: input, output, total, cache read/write
 * - Context usage percentage (with validation)
 * - Session duration (elapsed time)
 * - Accurate resume commands
 * - Actual session file name
 *
 * Note: Cost calculation is removed as provider rates vary and
 * accurate cost data may not be available in session entries.
 *
 * The summary is printed via a notification and also appended as a custom
 * entry for persistence.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

interface MessageStats {
  user: number;
  assistant: number;
  system: number;
  toolResults: number;
  custom: number;
  total: number;
}

interface TokenUsage {
  input: number;
  output: number;
  total: number;
  cacheRead: number;
  cacheWrite: number;
}

interface ValidatedContextUsage {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
  isValid: boolean;
}

// ============================================================================
// Formatting Helpers
// ============================================================================

function formatTokens(count: number): string {
  if (count === 0) return "0";
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1000000).toFixed(2)}M`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

/**
 * Draw a horizontal rule
 */
function rule(char: string = "\u2500", width: number = 60): string {
  return char.repeat(width);
}

// ============================================================================
// Data Validation & Extraction
// ============================================================================

/**
 * Extract session ID from multiple sources for accuracy
 */
function getValidatedSessionId(ctx: ExtensionContext, entries: any[]): string {
  // First try: Get from session entry in the data
  for (const entry of entries) {
    if (entry.type === "session" && entry.id && typeof entry.id === "string") {
      const sessionId = entry.id.trim();
      if (sessionId.length > 0) {
        return sessionId;
      }
    }
  }
  
  // Second try: Get from session manager
  try {
    const sessionId = ctx.sessionManager.getSessionId?.();
    if (sessionId && typeof sessionId === "string" && sessionId.trim().length > 0) {
      return sessionId.trim();
    }
  } catch (error) {
    // Fall through to default
  }
  
  return "unknown-session-id";
}

/**
 * Count all message types accurately
 */
function countMessages(entries: any[]): MessageStats {
  const stats: MessageStats = {
    user: 0,
    assistant: 0,
    system: 0,
    toolResults: 0,
    custom: 0,
    total: 0
  };
  
  for (const entry of entries) {
    if (entry.type === "message" && entry.message) {
      const role = entry.message.role || "unknown";
      
      switch (role) {
        case "user":
          stats.user++;
          break;
        case "assistant":
          stats.assistant++;
          break;
        case "system":
          stats.system++;
          break;
        case "tool_result":
          stats.toolResults++;
          break;
        default:
          stats.custom++;
          break;
      }
      
      stats.total++;
    }
  }
  
  return stats;
}

/**
 * Calculate token usage from all assistant messages
 */
function calculateTokenUsage(entries: any[]): TokenUsage {
  const usage: TokenUsage = {
    input: 0,
    output: 0,
    total: 0,
    cacheRead: 0,
    cacheWrite: 0
  };
  
  for (const entry of entries) {
    if (entry.type === "message" && 
        entry.message?.role === "assistant" && 
        entry.message.usage) {
      
      const msgUsage = entry.message.usage;
      usage.input += msgUsage.input || 0;
      usage.output += msgUsage.output || 0;
      usage.cacheRead += msgUsage.cacheRead || 0;
      usage.cacheWrite += msgUsage.cacheWrite || 0;
    }
  }
  
  usage.total = usage.input + usage.output;
  return usage;
}

/**
 * Validate context usage data
 */
function getValidatedContextUsage(ctx: ExtensionContext): ValidatedContextUsage | null {
  try {
    const usage = ctx.getContextUsage?.();
    if (!usage) {
      return null;
    }
    
    const isValid = (
      usage.tokens !== null &&
      usage.contextWindow !== null &&
      usage.contextWindow > 0
    );
    
    return {
      tokens: usage.tokens,
      contextWindow: usage.contextWindow || 0,
      percent: usage.percent,
      isValid
    };
  } catch (error) {
    return null;
  }
}

/**
 * Find actual session file name
 */
function findSessionFilename(sessionId: string): string | null {
  try {
    const sessionsDir = path.join(process.env.HOME || '/home/sujit', '.pi', 'agent', 'sessions');
    
    if (!fs.existsSync(sessionsDir)) {
      return null;
    }
    
    // Look through all session directories
    const sessionDirs = fs.readdirSync(sessionsDir);
    
    for (const dir of sessionDirs) {
      const dirPath = path.join(sessionsDir, dir);
      if (fs.statSync(dirPath).isDirectory()) {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          if (file.endsWith('.jsonl') && file.includes(sessionId)) {
            return file;
          }
        }
      }
    }
  } catch (error) {
    // Silent fail - file detection is nice-to-have
  }
  
  return null;
}

// ============================================================================
// Summary Building
// ============================================================================

/**
 * Build the session summary text
 */
function buildSummary(ctx: ExtensionContext, startTime: number): string {
  const lines: string[] = [];
  const W = 60;

  lines.push(rule("\u2501", W));
  lines.push(`  \u2728  SESSION SUMMARY`);
  lines.push(rule("\u2501", W));
  lines.push("");

  // Get and validate data
  const entries = ctx.sessionManager.getEntries();
  const sessionId = getValidatedSessionId(ctx, entries);
  const sessionName = ctx.sessionManager.getSessionName();
  const cwd = ctx.cwd;
  const messageStats = countMessages(entries);
  const tokenUsage = calculateTokenUsage(entries);
  const contextUsage = getValidatedContextUsage(ctx);
  const sessionFilename = findSessionFilename(sessionId);
  
  // Session info
  lines.push(`  \u{1F4C1}  Session    ${sessionName || sessionId.slice(0, 12)}`);
  lines.push(`             ID: ${sessionId}`);
  
  // Provide accurate resume instructions
  const partialId = sessionId.slice(0, 16);
  if (partialId.length >= 8) { // Only show if we have enough characters
    lines.push(`             Resume: pi --session ${partialId}`);
    lines.push(`                    cd ${cwd} && pi --session ${partialId}`);
  }
  
  if (sessionFilename) {
    lines.push(`             File: ${sessionFilename}`);
  }
  
  lines.push(`  \u{1F4CD}  Directory  ${cwd}`);
  lines.push("");

  // Model info (with validation)
  const model = ctx.model;
  if (model && model.id) {
    const provider = (model as any).provider || "unknown";
    const modelId = model.id;
    lines.push(`  \u{1F916}  Model      ${modelId}`);
    lines.push(`             Provider: ${provider}`);
  } else {
    lines.push(`  \u{1F916}  Model      (not available)`);
  }
  lines.push("");

  // Message statistics (complete)
  const duration = Date.now() - startTime;
  
  lines.push(`  \u{1F504}  Turns      ${messageStats.assistant}`);
  lines.push(`  \u{1F4E8}  Messages   ${messageStats.total} total`);
  
  // Show breakdown if we have multiple types
  const roleCounts = [];
  if (messageStats.user > 0) roleCounts.push(`${messageStats.user} user`);
  if (messageStats.assistant > 0) roleCounts.push(`${messageStats.assistant} assistant`);
  if (messageStats.system > 0) roleCounts.push(`${messageStats.system} system`);
  if (messageStats.toolResults > 0) roleCounts.push(`${messageStats.toolResults} tool`);
  if (messageStats.custom > 0) roleCounts.push(`${messageStats.custom} custom`);
  
  if (roleCounts.length > 1) {
    lines.push(`             (${roleCounts.join(', ')})`);
  }
  
  lines.push("");

  // Token usage
  lines.push(`  \u{1F4CA}  Token Usage`);
  lines.push(rule("\u2500", W));
  lines.push(`             Input:     \u2191 ${formatTokens(tokenUsage.input)}`);
  lines.push(`             Output:    \u2193 ${formatTokens(tokenUsage.output)}`);
  lines.push(`             Total:     = ${formatTokens(tokenUsage.total)}`);
  
  if (tokenUsage.cacheRead > 0 || tokenUsage.cacheWrite > 0) {
    lines.push(rule("\u2500", 30));
    if (tokenUsage.cacheRead > 0) {
      lines.push(`             Cache R:   R ${formatTokens(tokenUsage.cacheRead)}`);
    }
    if (tokenUsage.cacheWrite > 0) {
      lines.push(`             Cache W:   W ${formatTokens(tokenUsage.cacheWrite)}`);
    }
  }
  lines.push("");

  // Context (with validation)
  if (contextUsage?.isValid) {
    const pct = contextUsage.percent !== null ? `${contextUsage.percent.toFixed(1)}%` : "?";
    const tokens = contextUsage.tokens !== null ? formatTokens(contextUsage.tokens) : "?";
    const window = formatTokens(contextUsage.contextWindow);
    lines.push(`  \u{1F9E0}  Context    ${pct} (${tokens}/${window})`);
  } else if (contextUsage) {
    // Show partial info if available
    const window = formatTokens(contextUsage.contextWindow);
    lines.push(`  \u{1F9E0}  Context    ?/? (window: ${window})`);
  } else {
    lines.push(`  \u{1F9E0}  Context    (not available)`);
  }
  lines.push("");

  // Duration
  lines.push(`  \u23F1\uFE0F  Duration   ${formatDuration(duration)}`);
  lines.push("");
  
  // Additional resume options
  lines.push(`  \u{1F4DD}  Notes:`);
  lines.push(`             • Use 'pi -c' to continue most recent session`);
  lines.push(`             • Use 'pi -r' to browse all sessions`);
  lines.push(`             • Session files in: ~/.pi/agent/sessions/`);
  lines.push("");
  
  lines.push(rule("\u2501", W));

  return lines.join("\n");
}

// ============================================================================
// Extension Entry Point
// ============================================================================

const sessionStartTimes = new Map<string, number>();

export default async function (pi: ExtensionAPI): Promise<void> {
  /**
   * Track session start time
   */
  pi.on("session_start", async (_event: any, ctx: ExtensionContext) => {
    try {
      const entries = ctx.sessionManager.getEntries();
      const sessionId = getValidatedSessionId(ctx, entries);
      sessionStartTimes.set(sessionId, Date.now());
    } catch (error) {
      // Use fallback
      const sessionId = "unknown-" + Date.now();
      sessionStartTimes.set(sessionId, Date.now());
    }
  });

  pi.on("agent_start", async (_event: any, ctx: ExtensionContext) => {
    try {
      const entries = ctx.sessionManager.getEntries();
      const sessionId = getValidatedSessionId(ctx, entries);
      if (!sessionStartTimes.has(sessionId)) {
        sessionStartTimes.set(sessionId, Date.now());
      }
    } catch (error) {
      // Silent fail - timing is not critical
    }
  });

  /**
   * Show summary on session shutdown (Ctrl+C)
   */
  pi.on("session_shutdown", async (_event: any, ctx: ExtensionContext) => {
    try {
      const entries = ctx.sessionManager.getEntries();
      const sessionId = getValidatedSessionId(ctx, entries);
      const startTime = sessionStartTimes.get(sessionId) || Date.now();

      const summary = buildSummary(ctx, startTime);
      ctx.ui.notify(summary, "info");
      
    } catch (error) {
      // Show minimal error message
      const errorMsg = `[session-exit-summary] Error: ${error instanceof Error ? error.message : String(error)}`;
      try {
        ctx.ui.notify(`Session summary unavailable.\n${errorMsg}`, "error");
      } catch {
        // Last resort - console might not be available during shutdown
      }
    }
  });
}