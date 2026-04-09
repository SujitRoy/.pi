# PI AgentRouter Fix Patch Script
# Re-applies the X-Stainless-* header injection to PI's OpenAI provider
# Run with: powershell -ExecutionPolicy Bypass -File patch-agentrouter.ps1

$ErrorActionPreference = "Stop"

$PI_AI_DIR = Join-Path $env:APPDATA "npm\node_modules\@mariozechner\pi-coding-agent\node_modules\@mariozechner\pi-ai"
$TARGET = Join-Path $PI_AI_DIR "dist\providers\openai-completions.js"

Write-Host "========================================"
Write-Host "  PI AgentRouter Header Patch"
Write-Host "========================================"
Write-Host ""

# Check file exists
if (-not (Test-Path $TARGET)) {
    Write-Host "ERROR: PI provider file not found:" -ForegroundColor Red
    Write-Host "  $TARGET"
    Write-Host ""
    Write-Host "Make sure PI is installed: npm install -g @mariozechner/pi-coding-agent"
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Found PI provider file:"
Write-Host "  $TARGET"
Write-Host ""

# Check if already patched
$content = [System.IO.File]::ReadAllText($TARGET)
if ($content -match "AgentRouter requires specific X-Stainless") {
    Write-Host "AgentRouter patch is ALREADY applied." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 0
}

# Create backup
$backup = "$TARGET.bak"
Copy-Item $TARGET $backup -Force
Write-Host "  Backup created: openai-completions.js.bak"

# The patch: inject AgentRouter headers before OpenAI client creation
$oldText = @"
    // Merge options headers last so they can override defaults
    if (optionsHeaders) {
        Object.assign(headers, optionsHeaders);
    }
    return new OpenAI({
"@

$newText = @"
    // Merge options headers last so they can override defaults
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
    return new OpenAI({
"@

if ($content -notmatch [regex]::Escape($oldText)) {
    Write-Host "ERROR: Could not find expected pattern in openai-completions.js" -ForegroundColor Red
    Write-Host "The PI version may have changed. Manual patching required." -ForegroundColor Red
    Write-Host ""
    Write-Host "Look for this function in ${TARGET}:"
    Write-Host "  function createClient(model, context, apiKey, optionsHeaders)"
    Write-Host "And add the AgentRouter header block before: return new OpenAI({"
    exit 1
}

$content = $content.Replace($oldText, $newText)
[System.IO.File]::WriteAllText($TARGET, $content, [System.Text.Encoding]::UTF8)

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  PATCH APPLIED SUCCESSFULLY" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Restart PI for changes to take effect."
Write-Host "If anything breaks, restore backup:"
Write-Host "  Copy-Item `"$backup`" `"$TARGET`" -Force"
Write-Host ""
