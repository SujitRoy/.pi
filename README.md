# PI Agent Configuration

Personal skills, model configurations, and coding standards for the [PI Coding Agent](https://github.com/badlogic/pi-mono), a terminal-based AI coding assistant.

## Structure

```
.pi/
├── agent/
│   ├── models.json       Provider and model definitions (gitignored)
│   ├── settings.json     Default model and thinking level
│   ├── AGENTS.md         Coding standards and behavior rules
│   ├── skills/           High-performance skill modules
│   ├── extensions/       JavaScript extensions (callable tools)
│   ├── auth.json         Authentication tokens (gitignored)
│   ├── sessions/         Conversation history (gitignored)
│   └── bin/              Downloaded tools (gitignored)
├── scripts/
│   ├── patch-agentrouter.ps1   Windows patch for AgentRouter
│   ├── patch-agentrouter.sh    Linux/macOS patch for AgentRouter
│   └── README.md               Patch documentation
├── .gitignore
└── README.md
```

## What Is Tracked

Files in this repository define how the PI agent behaves:

- **settings.json** - Default model and thinking level
- **AGENTS.md** - Global instructions for code quality, architecture, and communication
- **skills/** - 17 domain-specific skill modules following the Agent Skills spec
- **scripts/** - Reusable patch scripts for known provider issues

## What Is Not Tracked

The following are excluded via `.gitignore` because they contain personal data or are machine-specific:

- **models.json** - API provider endpoints, keys, and model specifications
- **auth.json** - OAuth tokens and API credentials
- **sessions/** - Full conversation history with the agent
- **bin/** - Downloaded binary tools (fd, rg, etc.)

## Setup

Clone this repository to your home directory:

```bash
git clone https://github.com/SujitRoy/.pi.git ~/.pi
```

Then configure your own providers in `agent/models.json` (create it if it does not exist) and authenticate PI:

```bash
pi /login
```

Each provider in `models.json` needs:
- `baseUrl` - API endpoint
- `apiKey` - Your API token
- `api` - Provider type (usually `openai-completions`)
- `models` - Array of available models with context, reasoning, and token settings

## Skills

17 high-performance skill modules are included, optimized for minimal token usage and strong agentic behavior:

| Skill | Purpose |
|-------|---------|
| **execute** | Task execution with inspection, direct action, and end-to-end completion |
| **coding** | Write and edit code following repo conventions with smallest complete changes |
| **debug** | Root-cause analysis for bugs, errors, failures, and unexpected behavior |
| **review** | Code review focused on correctness, security, performance, maintainability, and tests |
| **test** | Add and improve tests matching existing framework and style |
| **plan** | Create short outcome-oriented plans for complex, ambiguous, or risky tasks |
| **refactor** | Improve code structure without changing intended behavior |
| **security** | Vulnerability identification, secure patterns, OWASP validation |
| **documentation** | Clear, concise, accurate technical documentation with examples |
| **performance** | Profile, identify bottlenecks, optimize, measure, and validate |
| **git** | Conventional commits, feature branches, clean history, semantic versioning |
| **infrastructure** | Docker, CI/CD, cloud deployment, infrastructure-as-code |
| **data** | Database design, migrations, queries, and data integrity |
| **api** | REST API design, contracts, versioning, and endpoint conventions |
| **architecture** | System design, patterns, boundaries, and structural decisions |
| **observability** | Logging, metrics, tracing, and alerting for production systems |
| **frontend** | UI development, accessibility, responsiveness, and client-side best practices |

## Skill Format

Skills follow the [Agent Skills](https://github.com/marcfargas/skills) specification:

- Each skill is a directory containing a `SKILL.md` file
- The skill `name` in frontmatter must match the directory name
- Skills include a `description` for discovery

```
skills/
  coding/
    SKILL.md        # name: coding (matches directory)
  debug/
    SKILL.md        # name: debug (matches directory)
```

## Adding Your Own Skills

Create a directory with a `SKILL.md` file inside `agent/skills/`:

```
agent/skills/docker/SKILL.md
agent/skills/react/SKILL.md
agent/skills/postgres/SKILL.md
```

Each `SKILL.md` must have YAML frontmatter with `name` and `description`:

```yaml
---
name: docker
description: Docker and container management best practices
---

When working with Docker:
- ...
```

## Extensions

Extensions are JavaScript modules that add callable tools to the PI agent.

### Web Search Extension

Enables live web search and URL content fetching via a [SearXNG](https://github.com/searxng/searxng) instance.

**Available Tools:**

| Tool | Purpose |
|------|---------|
| `web_search` | Search the web with depth modes (fast, standard, deep) |
| `fetch_content` | Extract readable content from any URL |

**Installation:**

1. Configure your SearXNG URL in `.env` (see `.env.example`):
   ```
   SEARXNG_BASE_URL=http://your-searxng-host:port
   ```

2. Install the extension **globally** (available in all PI sessions):
   ```bash
   # From ~/.pi directory
   pi install ./agent/extensions/web-search.js
   ```
   > Omit `-l` (local flag) to install globally. Without `-l`, the tools are available in every PI session regardless of directory.

3. Verify both tools are available:
   ```bash
   pi list
   ```
   Should show under "User packages:"

4. Start using:
   ```bash
   pi   # Both tools are now available in any session
   ```

**Usage Examples:**
```javascript
// Search the web
web_search({ query: "TypeScript 5.0 features", depth: "standard" })
web_search({ query: "latest AI news", category: "news", depth: "deep" })

// Fetch content from a URL
fetch_content({ url: "https://example.com/article" })
fetch_content({ url: "https://docs.python.org/3/tutorial", prompt: "How do decorators work?" })
fetch_content({ url: "https://example.com/long-article", maxLength: 5000 })
```

**Security Features:**
- SSRF protection (blocks internal/private network URLs)
- Content-Type validation (text-based content only)
- Automatic redirect following (up to 5 hops)
- Intelligent caching (5-min TTL)

### Custom Footer Extension

Replaces the built-in footer with a custom multicolor component showing enhanced session stats:

**Features:**
- Git branch and working directory status
- Git stats (staged, modified, untracked, deleted files)
- Context usage percentage and token counts
- Model information with provider
- Thinking level display (with Shift+Tab cycling)
- Session token usage (input/output/total/cache)
- Total cost
- Session name and turn count
- Extension status lines from other extensions

**Installation:**
Add to your `settings.json` packages list:
```json
{
  "packages": [
    "extensions/footer-status.js",
    // ... other packages
  ]
}
```

**Usage:**
The footer loads automatically when PI starts. Use **Shift+Tab** to cycle through thinking levels (off → minimal → low → medium → high → xhigh → off).

### Session Exit Summary Extension

Displays a rich summary when you exit a session (Ctrl+C):

**Features:**
- Session ID and name
- Working directory
- Model used (provider + model ID)
- Total turns (agent interactions)
- Token usage: input, output, total, cache read/write
- Context usage percentage
- Number of messages exchanged
- Session duration (elapsed time)

**Note:** Cost calculation is not included because provider pricing rates vary and accurate cost data may not be available in session entries.

**Installation:**
Add to your `settings.json` packages list:
```json
{
  "packages": [
    "extensions/session-exit-summary.js",
    // ... other packages
  ]
}
```

**Usage:**
The summary appears automatically when you exit a session with Ctrl+C.

### All Available Extensions

This repository includes several useful extensions:

| Extension | Description | How to Install |
|-----------|-------------|----------------|
| `footer-status.js` | Enhanced multicolor footer with stats | Add to `settings.json` packages |
| `session-exit-summary.js` | Session summary on exit (Ctrl+C) | Add to `settings.json` packages |
| `pi-search.js` | Web search and content fetching | See Web Search Extension above |
| `planning.js` | Planning assistant tools | Add to `settings.json` packages |
| `git-tools.js` | Git operations as callable tools | Not enabled by default |
| `theme-aurora.js` | Custom theme management | Not enabled by default |

**Complete Example `settings.json`:**
```json
{
  "defaultProvider": "agentrouter",
  "defaultModel": "deepseek-v3.2",
  "defaultThinkingLevel": "high",
  "theme": "tokyo-night",
  "packages": [
    "extensions/footer-status.js",
    "extensions/pi-search.js",
    "extensions/planning.js",
    "extensions/session-exit-summary.js",
    "npm:pi-gsd"
  ]
}
```

### Building Extensions from Source

The extensions are written in TypeScript and compiled to JavaScript. If you want to modify them:

1. **Navigate to the extensions directory:**
   ```bash
   cd ~/.pi/agent/extensions
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build all extensions:**
   ```bash
   npm run build
   ```

4. **Or build a specific extension:**
   ```bash
   npx tsc typescript-src/footer-status.ts --outDir ./dist --target ES2020 --module commonjs --moduleResolution node --skipLibCheck true --esModuleInterop true
   ```

**Note:** The TypeScript compilation requires `@mariozechner/pi-coding-agent` types which are only available when running within PI. For development, you may need to disable strict type checking or compile with `skipLibCheck: true`.

**Project Structure:**
```
extensions/
├── typescript-src/          # TypeScript source files
│   ├── footer-status.ts
│   ├── session-exit-summary.ts
│   ├── pi-search.ts
│   ├── planning.ts
│   ├── git-tools.ts
│   └── theme-aurora.ts
├── dist/                    # Compiled JavaScript files
├── *.js                    # Symlinks to dist/ files
├── package.json            # Build dependencies
└── tsconfig.json           # TypeScript configuration
```

## Syncing Across Machines

Push changes:

```bash
cd ~/.pi
git add .
git commit -m "description of changes"
git push
```

Pull on another machine:

```bash
cd ~/.pi
git pull
```

Re-configure `agent/models.json` and re-authenticate on the new machine since those files are not tracked.

## License

MIT
