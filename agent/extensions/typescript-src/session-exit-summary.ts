/**
 * PI Agent Extension: Session Exit Summary
 *
 * Displays a rich summary of the session when the user exits (Ctrl+C).
 * Shows in a structured, readable format:
 * - Session ID and name
 * - Working directory
 * - Model used (provider + model ID)
 * - Total turns (agent interactions)
 * - Token usage: input, output, total, cache read/write
 * - Context usage percentage
 * - Session duration (elapsed time)
 * - Number of messages exchanged
 *
 * Note: Cost calculation is removed as provider rates vary and
 * accurate cost data may not be available in session entries.
 *
 * The summary is printed via a notification and also appended as a custom
 * entry for persistence.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

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

  // Session info
  const sessionId = ctx.sessionManager.getSessionId?.() || "unknown";
  const sessionName = ctx.sessionManager.getSessionName();
  const cwd = ctx.cwd;
  lines.push(`  \u{1F4C1}  Session    ${sessionName ? sessionName : sessionId.slice(0, 12)}`);
  if (sessionName) lines.push(`             ID: ${sessionId.slice(0, 16)}`);
  lines.push(`  \u{1F4CD}  Directory  ${cwd}`);
  lines.push("");

  // Model info
  const model = ctx.model;
  if (model) {
    const provider = (model as any).provider || "unknown";
    const modelId = model.id || "unknown";
    lines.push(`  \u{1F916}  Model      ${modelId}`);
    lines.push(`             Provider: ${provider}`);
  } else {
    lines.push(`  \u{1F916}  Model      (none)`);
  }
  lines.push("");

  // Session stats
  const entries = ctx.sessionManager.getEntries();
  let turns = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let userMessages = 0;

  for (const entry of entries) {
    if (entry.type === "message") {
      if (entry.message.role === "assistant") {
        turns++;
        totalInput += entry.message.usage.input || 0;
        totalOutput += entry.message.usage.output || 0;
        totalCacheRead += entry.message.usage.cacheRead || 0;
        totalCacheWrite += entry.message.usage.cacheWrite || 0;
      } else if (entry.message.role === "user") {
        userMessages++;
      }
    }
  }

  const duration = Date.now() - startTime;

  lines.push(`  \u{1F504}  Turns      ${turns}`);
  lines.push(`  \u{1F4E8}  Messages   ${userMessages} user, ${turns} assistant`);
  lines.push("");

  // Token usage
  lines.push(`  \u{1F4CA}  Token Usage`);
  lines.push(rule("\u2500", W));
  lines.push(`             Input:     \u2191 ${formatTokens(totalInput)}`);
  lines.push(`             Output:    \u2193 ${formatTokens(totalOutput)}`);
  const total = totalInput + totalOutput;
  lines.push(`             Total:     = ${formatTokens(total)}`);
  if (totalCacheRead > 0) {
    lines.push(`             Cache R:   R ${formatTokens(totalCacheRead)}`);
  }
  if (totalCacheWrite > 0) {
    lines.push(`             Cache W:   W ${formatTokens(totalCacheWrite)}`);
  }
  lines.push("");

  // Context
  const ctxUsage = ctx.getContextUsage();
  if (ctxUsage) {
    const pct = ctxUsage.percent !== null ? `${ctxUsage.percent.toFixed(1)}%` : "?";
    const tokens = ctxUsage.tokens !== null ? formatTokens(ctxUsage.tokens) : "?";
    const window = formatTokens(ctxUsage.contextWindow);
    lines.push(`  \u{1F9E0}  Context    ${pct} (${tokens}/${window})`);
  }
  lines.push("");

  // Duration
  lines.push(`  \u23F1\uFE0F  Duration   ${formatDuration(duration)}`);
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
    sessionStartTimes.set(ctx.sessionManager.getSessionId?.() || "default", Date.now());
  });

  pi.on("agent_start", async (_event: any, ctx: ExtensionContext) => {
    const sid = ctx.sessionManager.getSessionId?.() || "default";
    if (!sessionStartTimes.has(sid)) {
      sessionStartTimes.set(sid, Date.now());
    }
  });

  /**
   * Show summary on session shutdown (Ctrl+C)
   */
  pi.on("session_shutdown", async (_event: any, ctx: ExtensionContext) => {
    const sid = ctx.sessionManager.getSessionId?.() || "default";
    const startTime = sessionStartTimes.get(sid) || Date.now();

    try {
      const summary = buildSummary(ctx, startTime);
      ctx.ui.notify(summary, "info");
    } catch {
      // Ignore errors during shutdown
    }
  });
}
