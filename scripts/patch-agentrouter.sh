#!/usr/bin/env bash
# PI AgentRouter Fix Patch Script (Linux/macOS)
# Re-applies the X-Stainless-* header injection to PI's OpenAI provider
# Usage: bash patch-agentrouter.sh

set -euo pipefail

echo "========================================"
echo "  PI AgentRouter Header Patch (Linux)"
echo "========================================"
echo ""

# Resolve PI installation directory — try multiple strategies
PI_AI_DIR=""
if command -v pi &>/dev/null && [ -n "${PI_BIN:-}" ]; then
    # Try resolving via the `pi` binary location
    PI_BIN_PATH="$(which pi 2>/dev/null || true)"
    if [ -n "$PI_BIN_PATH" ]; then
        PI_LIB_DIR="$(dirname "$PI_BIN_PATH")/../lib/node_modules"
        CANDIDATE="$PI_LIB_DIR/@mariozechner/pi-coding-agent/node_modules/@mariozechner/pi-ai"
        if [ -d "$CANDIDATE" ]; then
            PI_AI_DIR="$CANDIDATE"
        fi
    fi
fi

# Fallback: use npm root -g
if [ -z "$PI_AI_DIR" ]; then
    PI_AI_DIR="$(npm root -g 2>/dev/null)/@mariozechner/pi-coding-agent/node_modules/@mariozechner/pi-ai"
fi

# Fallback: check nvm directly
if [ -z "$PI_AI_DIR" ] || [ ! -d "$PI_AI_DIR" ]; then
    if [ -n "${NVM_DIR:-}" ] && [ -d "$NVM_DIR" ]; then
        for NODE_VER_DIR in "$NVM_DIR"/versions/node/*/; do
            CANDIDATE="$NODE_VER_DIR/lib/node_modules/@mariozechner/pi-coding-agent/node_modules/@mariozechner/pi-ai"
            if [ -d "$CANDIDATE" ]; then
                PI_AI_DIR="$CANDIDATE"
                break
            fi
        done
    fi
fi

TARGET="${PI_AI_DIR}/dist/providers/openai-completions.js"

if [ ! -f "$TARGET" ]; then
    echo "ERROR: PI provider file not found:"
    echo "  $TARGET"
    echo ""
    echo "Searched locations:"
    echo "  npm root -g: $(npm root -g 2>/dev/null || echo 'N/A')"
    echo "  NVM_DIR: ${NVM_DIR:-'not set'}"
    echo ""
    echo "Make sure PI is installed: npm install -g @mariozechner/pi-coding-agent"
    exit 1
fi

echo "Found PI provider file:"
echo "  $TARGET"
echo ""

# Check if already patched
if grep -q "AgentRouter requires specific X-Stainless" "$TARGET" 2>/dev/null; then
    echo "✅  AgentRouter patch is ALREADY applied. No changes needed."
    exit 0
fi

# Create backup
cp "$TARGET" "${TARGET}.bak"
echo "  📦 Backup created: openai-completions.js.bak"

# Use perl for reliable multi-line replacement
# We inject AgentRouter-compatible headers before `return new OpenAI({`
perl -0777 -i -pe '
    s{(\n    // Merge options headers last so they can override defaults\n    if \(optionsHeaders\) \{\n        Object\.assign\(headers, optionsHeaders\);\n    \}\n)(    return new OpenAI\()}
    {$1    // AgentRouter requires specific X-Stainless-* headers to identify approved clients\n    // Without these, it returns 401 "unauthorized client detected"\n    // See: https://github.com/anomalyco/opencode/issues/2784#issuecomment-3589200032\n    if (model.baseUrl.includes("agentrouter.org")) {\n        headers["User-Agent"] = "RooCode/3.34.8";\n        headers["X-Title"] = "Roo Code";\n        headers["HTTP-Referer"] = "https://github.com/RooVetGit/Roo-Cline";\n        headers["X-Stainless-Runtime-Version"] = "v22.20.0";\n        headers["X-Stainless-Runtime"] = "node";\n        headers["X-Stainless-Arch"] = "x64";\n        headers["X-Stainless-OS"] = "Linux";\n        headers["X-Stainless-Lang"] = "js";\n    }\n$2}g
' "$TARGET"

if grep -q "AgentRouter requires specific X-Stainless" "$TARGET" 2>/dev/null; then
    echo ""
    echo "========================================"
    echo "  ✅ PATCH APPLIED SUCCESSFULLY"
    echo "========================================"
    echo ""
    echo "Restart PI for changes to take effect."
    echo "To undo, restore backup:"
    echo "  cp \"${TARGET}.bak\" \"${TARGET}\""
else
    echo ""
    echo "❌ ERROR: Patch may not have applied correctly."
    echo ""
    echo "To restore backup:"
    echo "  cp \"${TARGET}.bak\" \"${TARGET}\""
    echo ""
    echo "Manual fix — in $TARGET, find:"
    echo "  function createClient(model, context, apiKey, optionsHeaders)"
    echo "And add the AgentRouter header block before: return new OpenAI({"
    exit 1
fi
