# Pi Extensions - Official Compliance

This directory contains Pi extensions that follow the official guidelines from:
https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md

## Structure

All extensions are TypeScript files placed directly in `~/.pi/agent/extensions/`. Pi loads them via jiti (TypeScript runtime compilation), so no build process is needed.

## Current Extensions

1. **footer-status.ts** - Custom powerline footer with multicolor display
2. **git-tools.ts** - Enhanced git operations with security validation  
3. **pi-search.ts** - Intelligent web search with AI enhancement
   - **Configuration Required**: Set `SEARXNG_BASE_URL` environment variable or create `~/.pi/agent/search-config.json`
   - Example config: `{"searxngUrl": "http://localhost:8081"}`
   - See `search-config.example.json` for details
4. **planning.ts** - GEMINI.md compliance and validation tools
5. **session-exit-summary.ts** - Rich session summary on exit
6. **theme-aurora.ts** - Aurora theme registration

## Compliance Status

### ✅ **Fully Compliant**
- [x] **Location**: All extensions in `~/.pi/agent/extensions/*.ts`
- [x] **Export Pattern**: Each exports `default function (pi: ExtensionAPI)`
- [x] **Imports**: Proper `import type { ExtensionAPI }` usage
- [x] **No Shebang**: Removed `#!/usr/bin/env node` from all files
- [x] **Tool Registration**: All use `pi.registerTool()` with proper `execute()` method
- [x] **Event Handling**: All use `pi.on()` for events with `ctx.hasUI` checks
- [x] **Result Shape**: All tools return `{ content: [{ type: "text", text: string }], details: object }`
- [x] **Error Handling**: Tools throw errors properly for failure cases
- [x] **Security**: Input validation and AbortSignal handling implemented

### ✅ **Simplified Structure**
- [x] **No Build Process**: Removed `dist/`, `node_modules/`, `package.json`, `tsconfig.json`
- [x] **No Symlinks**: TypeScript files placed directly in extensions directory
- [x] **Clean**: Only essential TypeScript files remain

## Verification

To verify extensions load correctly:

1. Start Pi: `pi`
2. Check console for extension loading messages
3. Use `/reload` to reload extensions
4. Test tools with: `search`, `git_status`, `validate_impact_radius`, etc.

**Note for pi-search**: You must configure a SearXNG instance:
```bash
# Option 1: Environment variable
export SEARXNG_BASE_URL="http://localhost:8081"

# Option 2: Config file
cp search-config.example.json ~/.pi/agent/search-config.json
# Edit the URL in the config file
```

## Backup

The old build setup is backed up in `backup-old-setup/` if needed for reference.

## Official Guidelines Followed

1. **Surgical Precision**: Each extension makes minimal, focused changes
2. **Empirical Validation**: Tools help validate before making changes
3. **Efficiency Discipline**: Extensions optimize workflow
4. **Security Absolutism**: Input validation, command injection prevention
5. **Google L7/L9 Protocols**: Clean code, proper error handling

## Notes

- Pi loads `.ts` files directly via jiti - no compilation needed
- Extensions run with full system permissions - only install trusted code
- Use `pi -e ./path.ts` for quick testing of individual extensions
- Extensions in auto-discovered locations can be hot-reloaded with `/reload`