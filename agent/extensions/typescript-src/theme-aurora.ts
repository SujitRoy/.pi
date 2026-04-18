/**
 * PI Agent Extension: Aurora Theme Registration
 *
 * Registers the "aurora" theme programmatically on extension load.
 * This makes the theme portable -- no need to manually copy theme.json
 * files. Works on any OS (Linux, macOS, Windows) out of the box.
 *
 * To activate after loading:
 *   /theme aurora
 * Or start Pi with: pi --theme aurora
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const AURORA_THEME = {
  name: "aurora",
  vars: {
    cyan: "#73daca",
    blue: "#7aa2f7",
    green: "#9ece6a",
    red: "#f7768e",
    yellow: "#e0af68",
    orange: "#ff9e64",
    purple: "#bb9af7",
    pink: "#f7768e",
    teal: "#7dcfff",
    rose: "#f48fb1",
    mint: "#73daca",
    gold: "#e0af68",
    lavender: "#c0caf5",
    sky: "#89ddff",
    fg: "#c0caf5",
    bg: "#1a1b26",
    bgDark: "#16161e",
    bgHighlight: "#292e42",
    bgGutter: "#1f2335",
    border: "#3b4261",
    borderLight: "#565f89",
    comment: "#565f89",
    dimGray: "#414868",
  },
  colors: {
    accent: "teal",
    border: "blue",
    borderAccent: "cyan",
    borderMuted: "border",
    success: "mint",
    error: "rose",
    warning: "orange",
    muted: "comment",
    dim: "dimGray",
    text: "fg",
    thinkingText: "lavender",
    selectedBg: "bgHighlight",
    userMessageBg: "bgDark",
    userMessageText: "fg",
    customMessageBg: "#1f2335",
    customMessageText: "lavender",
    customMessageLabel: "purple",
    toolPendingBg: "#1f2335",
    toolSuccessBg: "#1a2e1a",
    toolErrorBg: "#2e1a1a",
    toolTitle: "gold",
    toolOutput: "comment",
    mdHeading: "gold",
    mdLink: "blue",
    mdLinkUrl: "dimGray",
    mdCode: "mint",
    mdCodeBlock: "green",
    mdCodeBlockBorder: "comment",
    mdQuote: "comment",
    mdQuoteBorder: "comment",
    mdHr: "comment",
    mdListBullet: "teal",
    toolDiffAdded: "green",
    toolDiffRemoved: "rose",
    toolDiffContext: "comment",
    syntaxComment: "#565f89",
    syntaxKeyword: "purple",
    syntaxFunction: "blue",
    syntaxVariable: "fg",
    syntaxString: "green",
    syntaxNumber: "gold",
    syntaxType: "cyan",
    syntaxOperator: "rose",
    syntaxPunctuation: "fg",
    thinkingOff: "dimGray",
    thinkingMinimal: "#3b4261",
    thinkingLow: "#5a6a9e",
    thinkingMedium: "blue",
    thinkingHigh: "purple",
    thinkingXhigh: "rose",
    bashMode: "mint",
  },
  export: {
    pageBg: "#1a1b26",
    cardBg: "#1f2335",
    infoBg: "#2a2f3d",
  },
};

export default async function (): Promise<void> {
  try {
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");

    const defaultDir = path.join(os.homedir(), ".pi", "agent");
    const homeDir = path.resolve(os.homedir());

    let agentDir: string;
    if (process.env.PI_AGENT_DIR) {
      let rawDir = process.env.PI_AGENT_DIR;
      if (rawDir.startsWith("~/")) {
        rawDir = path.join(os.homedir(), rawDir.slice(2));
      }
      const resolved = path.resolve(rawDir);
      if (!resolved.startsWith(homeDir)) {
        console.warn(
          `[theme-aurora] PI_AGENT_DIR "${rawDir}" is outside home directory, using default`,
        );
        agentDir = defaultDir;
      } else {
        agentDir = resolved;
      }
    } else {
      agentDir = defaultDir;
    }

    const themesDir = path.join(agentDir, "themes");
    if (!fs.existsSync(themesDir)) {
      fs.mkdirSync(themesDir, { recursive: true });
    }

    const themePath = path.join(themesDir, "aurora.json");
    const expected =
      JSON.stringify(
        {
          $schema:
            "https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
          ...AURORA_THEME,
        },
        null,
        "\t",
      ) + "\n";

    const needsWrite =
      !fs.existsSync(themePath) ||
      fs.readFileSync(themePath, "utf8").trim() !== expected.trim();

    if (needsWrite) {
      fs.writeFileSync(themePath, expected, { encoding: "utf8", mode: 0o644 });
    }
  } catch {
    // Silently ignore -- theme writing is best-effort
  }
}
