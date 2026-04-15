# PI AgentRouter Patch

PI's OpenAI provider sends default `X-Stainless-*` headers that AgentRouter does not recognize, causing a `401 unauthorized client detected` error. This patch injects the exact header signature of an approved client (Roo Code).

## When to Use

- After (re)installing PI: `npm install -g @mariozechner/pi-coding-agent`
- After updating PI to a new version
- When you see `401 unauthorized client detected` from AgentRouter

## How to Run

### Linux / macOS (Bash)
```bash
bash ~/.pi/scripts/patch-agentrouter.sh
```

### Windows (PowerShell)
```powershell
powershell -ExecutionPolicy Bypass -File patch-agentrouter.ps1
```

### From the scripts directory
```bash
cd ~/.pi/scripts
bash patch-agentrouter.sh
```

## What It Does

1. Finds PI's `pi-ai` provider file at `%APPDATA%\npm\node_modules\@mariozechner\pi-coding-agent\node_modules\@mariozechner\pi-ai\dist\providers\openai-completions.js`
2. Creates a `.bak` backup of the original
3. Injects these headers when `baseUrl` includes `agentrouter.org`:

| Header | Value |
|--------|-------|
| `User-Agent` | `RooCode/3.34.8` |
| `X-Title` | `Roo Code` |
| `HTTP-Referer` | `https://github.com/RooVetGit/Roo-Cline` |
| `X-Stainless-Runtime-Version` | `v22.20.0` |
| `X-Stainless-Runtime` | `node` |
| `X-Stainless-Arch` | `x64` |
| `X-Stainless-OS` | `Linux` |
| `X-Stainless-Lang` | `js` |

## Restore Original

### Windows
```powershell
$PI = "$env:APPDATA\npm\node_modules\@mariozechner\pi-coding-agent\node_modules\@mariozechner\pi-ai\dist\providers"
Copy-Item "$PI\openai-completions.js.bak" "$PI\openai-completions.js" -Force
```

### Linux / macOS
```bash
PI="$(npm root -g)/@mariozechner/pi-coding-agent/node_modules/@mariozechner/pi-ai/dist/providers"
cp "$PI/openai-completions.js.bak" "$PI/openai-completions.js"
```

## Reference

- [Issue: Add Provider : agentrouter.org](https://github.com/anomalyco/opencode/issues/2784#issuecomment-3589200032)
