#!/usr/bin/env bash
# PI AgentRouter Fix Patch Script (Linux/macOS)
# Re-applies the X-Stainless-* header injection to PI's OpenAI provider
# Usage: bash patch-agentrouter.sh

set -euo pipefail

echo "========================================"
echo "  PI AgentRouter Header Patch (Linux)"
echo "========================================"
echo ""

# Find PI installation
PI_AI_DIR="$(npm root -g)/@mariozechner/pi-coding-agent/node_modules/@mariozechner/pi-ai"
TARGET="${PI_AI_DIR}/dist/providers/openai-completions.js"

if [ ! -f "$TARGET" ]; then
    echo "ERROR: PI provider file not found:"
    echo "  $TARGET"
    echo ""
    echo "Make sure PI is installed: npm install -g @mariozechner/pi-coding-agent"
    exit 1
fi

echo "Found PI provider file:"
echo "  $TARGET"
echo ""

# Check if already patched
if grep -q "AgentRouter requires specific X-Stainless" "$TARGET" 2>/dev/null; then
    echo "AgentRouter patch is ALREADY applied."
    exit 0
fi

# Create backup
cp "$TARGET" "${TARGET}.bak"
echo "  Backup created: openai-completions.js.bak"

# Apply patch using sed
# We need to add the AgentRouter header block after "Object.assign(headers, optionsHeaders);"
# and before "return new OpenAI({"

SED_PATTERN='    // Merge options headers last so they can override defaults\n    if (optionsHeaders) {\n        Object\.assign(headers, optionsHeaders);\n    }\n    return new OpenAI({'

SED_REPLACE='    // Merge options headers last so they can override defaults\
    if (optionsHeaders) {\
        Object.assign(headers, optionsHeaders);\
    }\
    // AgentRouter requires specific X-Stainless-* headers to identify approved clients\
    // Without these, it returns 401 "unauthorized client detected"\
    // See: https://github.com/anomalyco/opencode/issues/2784#issuecomment-3589200032\
    if (model.baseUrl.includes("agentrouter.org")) {\
        headers["User-Agent"] = "RooCode/3.34.8";\
        headers["X-Title"] = "Roo Code";\
        headers["HTTP-Referer"] = "https://github.com/RooVetGit/Roo-Cline";\
        headers["X-Stainless-Runtime-Version"] = "v22.20.0";\
        headers["X-Stainless-Runtime"] = "node";\
        headers["X-Stainless-Arch"] = "x64";\
        headers["X-Stainless-OS"] = "Linux";\
        headers["X-Stainless-Lang"] = "js";\
    }\
    return new OpenAI({'

# Use perl for reliable multi-line replacement
perl -0777 -i -pe '
    s{    // Merge options headers last so they can override defaults\n    if \(optionsHeaders\) \{\n        Object\.assign\(headers, optionsHeaders\);\n    \}\n    return new OpenAI\(}
    {    // Merge options headers last so they can override defaults
    if (optionsHeaders) {
        Object.assign(headers, optionsHeaders);
    }
    // AgentRouter requires specific X-Stainless-* headers to identify approved clients
    // Without these, it returns 401 "unauthorized client detected"
    // See: https://github.com/anomalyco/opencode/issues/2784#issuecomment-3589200032
    if (model.baseUrl.includes("agentrouter.org")) {
        headers["User-Agent"] = "RooCode/3.34.8";
        headers["X-Title"] = "Roo Code";
        headers["HTTP-Referer"] = "https://github.com/RooVetGit/Roo-Cline";
        headers["X-Stainless-Runtime-Version"] = "v22.20.0";
        headers["X-Stainless-Runtime"] = "node";
        headers["X-Stainless-Arch"] = "x64";
        headers["X-Stainless-OS"] = "Linux";
        headers["X-Stainless-Lang"] = "js";
    }
    return new OpenAI(}g
' "$TARGET"

if grep -q "AgentRouter requires specific X-Stainless" "$TARGET" 2>/dev/null; then
    echo ""
    echo "========================================"
    echo "  PATCH APPLIED SUCCESSFULLY"
    echo "========================================"
    echo ""
    echo "Restart PI for changes to take effect."
    echo "If anything breaks, restore backup:"
    echo "  cp \"${TARGET}.bak\" \"${TARGET}\""
else
    echo ""
    echo "ERROR: Patch may not have applied correctly."
    echo "Restore backup with:"
    echo "  cp \"${TARGET}.bak\" \"${TARGET}\""
    echo ""
    echo "Look for this function in $TARGET:"
    echo "  function createClient(model, context, apiKey, optionsHeaders)"
    echo "And add the AgentRouter header block before: return new OpenAI({"
    exit 1
fi
